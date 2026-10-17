import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import segmentation, transcripts, upload_transcript

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
    from app.database import async_session_maker
    from worker.transcribe_worker import run_transcribe_worker

    # queue.diarize слушает только контейнер diarize-worker: он загружает модель голосов,
    # и второй слушатель здесь удвоил бы память и делил бы записи между версиями кода
    tasks = [asyncio.create_task(
        _consume_forever("queue.transcribe_full", lambda: run_transcribe_worker(async_session_maker)))]
    logger.info("Workers started")

    yield

    for task in tasks:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    from app.rabbitmq import close as rabbitmq_close
    await rabbitmq_close()


app = FastAPI(title="VoiceIQ Transcription Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)
app.include_router(transcripts.router)
app.include_router(upload_transcript.router)
app.include_router(segmentation.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "transcription-service"}
