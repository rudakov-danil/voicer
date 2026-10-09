import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import conversations


# Анализ идёт и здесь (очередь слушает и analytics-worker): без этого строки INFO,
# в том числе расход токенов «LLM usage», не попадали в лог
logging.basicConfig(level=logging.INFO)


async def _start_worker():
    from worker.analyze_worker import start_consuming
    await start_consuming()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_start_worker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="analytics-engine", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)
app.include_router(conversations.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
