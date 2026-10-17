import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from redis.asyncio import Redis
from prometheus_fastapi_instrumentator import Instrumentator
from app import redis_client as rc
from app.config import settings
from app.routers import clinic, coins, demand, overview, sellers, conversations, export, alert_settings, analytics, compliance, notifications, coaching, home, script_breakdown, insights, upsell


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


async def _start_invalidation_worker():
    from worker.cache_invalidation_worker import start_consuming
    await _consume_forever("queue.cache.invalidate", start_consuming)


@asynccontextmanager
async def lifespan(app: FastAPI):
    rc.redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    task = asyncio.create_task(_start_invalidation_worker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await rc.redis.aclose()


app = FastAPI(title="dashboard-service", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.include_router(overview.router)
app.include_router(sellers.router)
app.include_router(conversations.router)
app.include_router(export.router)
app.include_router(alert_settings.router)
app.include_router(analytics.router)
app.include_router(compliance.router)
app.include_router(notifications.router)
app.include_router(coaching.router)
app.include_router(home.router)
app.include_router(script_breakdown.router)
app.include_router(insights.router)
app.include_router(upsell.router)
app.include_router(coins.router)
app.include_router(demand.router)
app.include_router(clinic.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
