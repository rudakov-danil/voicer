import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.routers import chunks, recordings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start stitch worker in background
    from worker.stitch_worker import run_stitch_worker
    from app.database import async_session_maker

    try:
        worker_task = asyncio.create_task(run_stitch_worker(async_session_maker))
        logger.info("Stitch worker task started")
    except Exception as e:
        logger.warning(f"Could not start stitch worker: {e}")
        worker_task = None

    yield

    if worker_task and not worker_task.done():
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

    from app.rabbitmq import close as rabbitmq_close
    await rabbitmq_close()


app = FastAPI(title="VoiceIQ Recorder Service", version="1.0.0", lifespan=lifespan)

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "recorder-service"}
