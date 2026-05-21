import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from redis.asyncio import Redis
from prometheus_fastapi_instrumentator import Instrumentator
from app import redis_client as rc
from app.config import settings
from app.routers import overview, sellers, conversations, export, alert_settings, analytics, compliance, notifications


async def _start_invalidation_worker():
    from worker.cache_invalidation_worker import start_consuming
    await start_consuming()


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


@app.get("/health")
async def health():
    return {"status": "ok"}
