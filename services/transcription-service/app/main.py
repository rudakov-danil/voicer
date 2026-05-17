import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import transcripts, upload_transcript

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import async_session_maker
    from worker.transcribe_worker import run_transcribe_worker
    from worker.diarize_worker import run_diarize_worker

    tasks = []
    try:
        tasks.append(asyncio.create_task(run_transcribe_worker(async_session_maker)))
        tasks.append(asyncio.create_task(run_diarize_worker(async_session_maker)))
        logger.info("Workers started")
    except Exception as e:
        logger.warning(f"Could not start workers: {e}")

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "transcription-service"}
