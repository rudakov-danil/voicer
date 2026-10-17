import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.routers import chunks, recordings, telephony, upload, mobile, context

logger = logging.getLogger(__name__)


async def _consume_forever(name: str, start) -> None:
    """Слушатель очереди внутри API-процесса. Первое connect_robust падает, если RabbitMQ
    ещё не поднялся (после перезагрузки сервера Docker стартует всё сразу, depends_on
    не учитывается), и без повтора задача молча умирала — API работал без слушателя."""
    log = logging.getLogger(__name__)
    while True:
        try:
            await start()
            return
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("%s consumer failed, retrying in 5 s", name)
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start stitch worker in background
    from worker.stitch_worker import run_stitch_worker
    from app.database import async_session_maker

    worker_task = asyncio.create_task(
        _consume_forever("queue.stitch", lambda: run_stitch_worker(async_session_maker)))
    logger.info("Stitch worker task started")

    mobile_task = asyncio.create_task(mobile.process_mobile_queue())
    yield

    mobile_task.cancel()
    try:
        await mobile_task
    except asyncio.CancelledError:
        pass

    if not worker_task.done():
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

    from app.rabbitmq import close as rabbitmq_close
    await rabbitmq_close()


app = FastAPI(title="VoiceIQ Recorder Service", version="1.0.0", lifespan=lifespan)
app.include_router(context.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(chunks.router)
app.include_router(recordings.router)
app.include_router(telephony.router)
app.include_router(upload.router)
app.include_router(mobile.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "recorder-service"}
