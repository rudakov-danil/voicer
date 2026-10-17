import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import conversations, coach


# Анализ идёт и здесь (очередь слушает и analytics-worker): без этого строки INFO,
# в том числе расход токенов «LLM usage», не попадали в лог
logging.basicConfig(level=logging.INFO)


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


async def _start_worker():
    from worker.analyze_worker import start_consuming
    await _consume_forever("queue.analyze", start_consuming)


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
app.include_router(coach.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
