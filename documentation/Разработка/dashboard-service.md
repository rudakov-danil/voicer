# Dashboard Service

## Описание
Микросервис для предоставления аналитических метрик и управления алертами. Читает данные из PostgreSQL, кэширует их в Redis, предоставляет REST API для фронтенда с различными представлениями данных (обзор, продавцы, разговоры, экспорт). Слушает очередь инвалидации кэша из analytics-engine и отправляет email-алерты при нарушении пороговых значений. Обеспечивает изоляцию данных по организации и магазину.

## Принципы работы
Архитектура основана на трёхуровневом кэшировании и асинхронной обработке событий:

1. Основной уровень: данные в PostgreSQL схемой analytics
2. Кэш уровень: Redis с TTL для метрик обзора, продавцов, разговоров
3. Инвалидация: Worker слушает очередь queue.cache.invalidate и удаляет соответствующие ключи
4. Алерты: при инвалидации кэша проверяются условия и отправляются email-уведомления
5. Контроль доступа: по role (admin/manager/viewer) и store_id для managers
6. Экспорт: генерация CSV файлов с загрузкой в MinIO

## Вход / Выход

**Входящие данные:**
- PostgreSQL таблицы analytics.conversations, conversation_script_results, conversation_scores, objections (читаемый доступ)
- RabbitMQ очередь queue.cache.invalidate: сообщения об изменениях данных
- REST GET запросы от фронтенда с фильтрацией и пагинацией

**Исходящие данные:**
- Redis кэш: ключи паттерна dashboard:*:{org_id}:{store_key}:{date_range}
- REST GET/POST/PUT ендпоинты: overview, sellers, conversations, export, alert_settings
- Email алерты через SMTP (aiosmtplib)
- CSV файлы в MinIO с presigned URL

## Полный код

### app/config.py
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dashboard_service:pass@localhost:5432/voiceiq"
    REDIS_URL: str = "redis://localhost:6379/0"
    RABBITMQ_URL: str = "amqp://voiceiq:pass@rabbitmq:5672/"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ANALYTICS_ENGINE_URL: str = "http://analytics-engine:8004"
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    SMTP_HOST: str = "smtp.yandex.ru"
    SMTP_PORT: int = 465
    SMTP_USER: str = "noreply@voiceiq.ru"
    SMTP_PASSWORD: str = "changeme_smtp"
    SMTP_FROM: str = "noreply@voiceiq.ru"
    CACHE_TTL_SECONDS: int = 300

    class Config:
        env_file = ".env"


settings = Settings()
```

### app/database.py
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

### app/dependencies.py
```python
import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify",
            headers={"Authorization": f"Bearer {credentials.credentials}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return resp.json()["payload"]


def org_store_conditions(user: dict) -> tuple[str, str | None]:
    """Return (org_id, store_id_or_None) based on role."""
    org_id = user["organization_id"]
    if user["role"] == "manager":
        return org_id, user.get("store_id")
    return org_id, None
```

### app/main.py
```python
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from redis.asyncio import Redis
from prometheus_fastapi_instrumentator import Instrumentator
from app import redis_client as rc
from app.config import settings
from app.routers import overview, sellers, conversations, export, alert_settings


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


@app.get("/health")
async def health():
    return {"status": "ok"}
```

### app/alerts.py
```python
import aiosmtplib
import logging
from email.message import EmailMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings

logger = logging.getLogger(__name__)


async def send_alert_email(recipients: list[str], subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=True,
    )


async def check_and_send_score_alert(
    org_id: str,
    store_id: str,
    overall_score: float,
    db: AsyncSession,
) -> None:
    """Check score threshold and send alert if score is below threshold."""
    result = await db.execute(
        text("""
            SELECT score_threshold, email_recipients, is_active
            FROM admin_schema.alert_settings
            WHERE (store_id = :store_id OR store_id IS NULL)
              AND organization_id = :org_id
              AND is_active = true
            ORDER BY store_id NULLS LAST
            LIMIT 1
        """),
        {"store_id": store_id, "org_id": org_id},
    )
    row = result.fetchone()
    if not row:
        return

    if overall_score < float(row.score_threshold):
        try:
            await send_alert_email(
                recipients=row.email_recipients,
                subject=f"[VoiceIQ] Низкий скор продавца: {overall_score:.0f}",
                body=(
                    f"Разговор в магазине получил оценку {overall_score:.0f} из 100, "
                    f"что ниже порога {float(row.score_threshold):.0f}.\n\n"
                    f"Перейти в дашборд: https://app.voiceiq.ru"
                ),
            )
        except Exception as e:
            logger.error("Failed to send alert email: %s", e)
```

### app/rabbitmq.py
```python
import aio_pika

_connection = None
_channel = None


async def get_channel():
    global _connection, _channel
    from app.config import settings
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    if _channel is None or _channel.is_closed:
        _channel = await _connection.channel()
    return _channel


async def close():
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _connection = None
    _channel = None
```

### app/redis_client.py
```python
import json
from redis.asyncio import Redis

redis: Redis = None  # initialized in lifespan


async def get_cached(key: str) -> dict | None:
    value = await redis.get(key)
    if value is None:
        return None
    return json.loads(value)


async def set_cached(key: str, data: dict, ttl_seconds: int = 300) -> None:
    await redis.setex(key, ttl_seconds, json.dumps(data, default=str))


async def invalidate_store_cache(org_id: str, store_id: str) -> None:
    """Delete all cache keys for this store."""
    pattern = f"dashboard:*:{org_id}:{store_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break


async def invalidate_org_cache(org_id: str) -> None:
    """Delete all cache keys for the organization."""
    pattern = f"dashboard:*:{org_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break
```

### app/routers/overview.py
```python
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import redis_client as rc
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["overview"])


@router.get("/overview")
async def get_overview(
    store_id: uuid.UUID | None = None,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    date_range = f"{date_from}_{date_to}"
    store_key = str(effective_store_id) if effective_store_id else "all"
    cache_key = f"dashboard:overview:{org_id}:{store_key}:{date_range}"

    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter = "AND store_id = :store_id" if effective_store_id else ""
    params = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
    }
    if effective_store_id:
        params["store_id"] = effective_store_id

    # Main aggregation
    agg_sql = text(f"""
        SELECT
            COUNT(*) AS total,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate,
            SUM(CASE WHEN overall_score >= 80 THEN 1 ELSE 0 END) AS excellent,
            SUM(CASE WHEN overall_score >= 60 AND overall_score < 80 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN overall_score < 60 THEN 1 ELSE 0 END) AS poor
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND session_date BETWEEN :date_from AND :date_to
          {store_filter}
    """)
    agg_result = (await db.execute(agg_sql, params)).fetchone()

    # Daily stats
    daily_sql = text(f"""
        SELECT
            session_date,
            COUNT(*) AS total,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY session_date
        ORDER BY session_date
    """)
    daily_rows = (await db.execute(daily_sql, params)).fetchall()

    result = {
        "period": {"from": str(date_from), "to": str(date_to)},
        "total_conversations": agg_result.total if agg_result else 0,
        "avg_score": round(float(agg_result.avg_score), 1) if agg_result else 0,
        "conversion_rate": round(float(agg_result.conversion_rate), 4) if agg_result else 0,
        "score_distribution": {
            "excellent": int(agg_result.excellent or 0),
            "good": int(agg_result.good or 0),
            "poor": int(agg_result.poor or 0),
        },
        "daily_stats": [
            {
                "date": str(row.session_date),
                "total": row.total,
                "avg_score": round(float(row.avg_score), 1),
                "conversion_rate": round(float(row.conversion_rate), 4),
            }
            for row in daily_rows
        ],
    }

    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result
```

### app/routers/sellers.py
```python
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import redis_client as rc
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["sellers"])


@router.get("/sellers")
async def list_sellers(
    store_id: uuid.UUID | None = None,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    sort_by: str = Query(default="avg_score"),
    limit: int = Query(default=50),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    # Previous period for trend
    period_days = (date_to - date_from).days or 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_days)

    store_filter = "AND store_id = :store_id" if effective_store_id else ""
    params = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "prev_from": prev_from,
        "prev_to": prev_to,
    }
    if effective_store_id:
        params["store_id"] = effective_store_id

    valid_sorts = {"avg_score": "avg_score DESC", "total": "total_conversations DESC", "conversion_rate": "conversion_rate DESC"}
    order_clause = valid_sorts.get(sort_by, "avg_score DESC")

    sql = text(f"""
        WITH current_period AS (
            SELECT
                seller_id,
                COUNT(*) AS total_conversations,
                COALESCE(AVG(overall_score), 0) AS avg_score,
                CASE WHEN COUNT(*) > 0
                     THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                     ELSE 0 END AS conversion_rate
            FROM analytics.conversations
            WHERE organization_id = :org_id
              AND session_date BETWEEN :date_from AND :date_to
              {store_filter}
            GROUP BY seller_id
        ),
        prev_period AS (
            SELECT
                seller_id,
                COALESCE(AVG(overall_score), 0) AS prev_avg_score
            FROM analytics.conversations
            WHERE organization_id = :org_id
              AND session_date BETWEEN :prev_from AND :prev_to
              {store_filter}
            GROUP BY seller_id
        )
        SELECT
            c.seller_id,
            c.total_conversations,
            c.avg_score,
            c.conversion_rate,
            COALESCE(p.prev_avg_score, 0) AS prev_avg_score
        FROM current_period c
        LEFT JOIN prev_period p ON c.seller_id = p.seller_id
        ORDER BY {order_clause}
        LIMIT :limit
    """)
    params["limit"] = limit
    rows = (await db.execute(sql, params)).fetchall()

    # Weakest step per seller
    weakest_sql = text(f"""
        SELECT
            c.seller_id,
            cs.step_name,
            AVG(cs.score) AS avg_step_score
        FROM analytics.conversations c
        JOIN analytics.conversation_scores cs ON cs.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY c.seller_id, cs.step_name
    """)
    weakest_rows = (await db.execute(weakest_sql, params)).fetchall()

    # Build weakest step map
    seller_steps: dict[str, dict] = {}
    for wr in weakest_rows:
        sid = str(wr.seller_id)
        if sid not in seller_steps or wr.avg_step_score < seller_steps[sid]["score"]:
            seller_steps[sid] = {"name": wr.step_name, "score": float(wr.avg_step_score)}

    items = []
    for row in rows:
        sid = str(row.seller_id)
        curr = float(row.avg_score)
        prev = float(row.prev_avg_score)
        if curr > prev + 2:
            trend = "up"
        elif curr < prev - 2:
            trend = "down"
        else:
            trend = "stable"

        items.append({
            "seller_id": row.seller_id,
            "total_conversations": row.total_conversations,
            "avg_score": round(curr, 1),
            "conversion_rate": round(float(row.conversion_rate), 4),
            "score_trend": trend,
            "weakest_step": seller_steps.get(sid, {}).get("name"),
        })

    return {"items": items, "total": len(items)}


@router.get("/sellers/{seller_id}/detail")
async def seller_detail(
    seller_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, _ = org_store_conditions(user)

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    params = {
        "org_id": uuid.UUID(org_id),
        "seller_id": seller_id,
        "date_from": date_from,
        "date_to": date_to,
    }

    stats_sql = text("""
        SELECT
            COUNT(*) AS total_conversations,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
    """)
    stats = (await db.execute(stats_sql, params)).fetchone()

    stage_sql = text("""
        SELECT cs.step_name, AVG(cs.score) AS avg_score
        FROM analytics.conversations c
        JOIN analytics.conversation_scores cs ON cs.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :date_from AND :date_to
        GROUP BY cs.step_name
        ORDER BY avg_score
    """)
    stage_rows = (await db.execute(stage_sql, params)).fetchall()

    recent_sql = text("""
        SELECT id, session_date, overall_score, outcome
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
        ORDER BY session_date DESC
        LIMIT 10
    """)
    recent_rows = (await db.execute(recent_sql, params)).fetchall()

    chart_sql = text("""
        SELECT session_date, AVG(overall_score) AS avg_score
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
        GROUP BY session_date
        ORDER BY session_date
    """)
    chart_rows = (await db.execute(chart_sql, params)).fetchall()

    return {
        "seller": {"id": seller_id},
        "stats": {
            "total_conversations": stats.total_conversations if stats else 0,
            "avg_score": round(float(stats.avg_score), 1) if stats else 0,
            "conversion_rate": round(float(stats.conversion_rate), 4) if stats else 0,
        },
        "stage_breakdown": [
            {"step_name": r.step_name, "avg_score": round(float(r.avg_score), 1)}
            for r in stage_rows
        ],
        "recent_conversations": [
            {
                "id": r.id,
                "session_date": str(r.session_date),
                "overall_score": float(r.overall_score) if r.overall_score else None,
                "outcome": r.outcome,
            }
            for r in recent_rows
        ],
        "score_chart": [
            {"date": str(r.session_date), "avg_score": round(float(r.avg_score), 1)}
            for r in chart_rows
        ],
    }
```

### app/routers/conversations.py
```python
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import httpx
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["conversations"])


@router.get("/conversations")
async def list_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    outcome: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    conditions = [
        "organization_id = :org_id",
        "session_date BETWEEN :date_from AND :date_to",
    ]
    params: dict = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }

    if effective_store_id:
        conditions.append("store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("seller_id = :seller_id")
        params["seller_id"] = seller_id
    if outcome:
        conditions.append("outcome = :outcome")
        params["outcome"] = outcome
    if score_min is not None:
        conditions.append("overall_score >= :score_min")
        params["score_min"] = score_min
    if score_max is not None:
        conditions.append("overall_score <= :score_max")
        params["score_max"] = score_max

    where = " AND ".join(conditions)

    count_sql = text(f"SELECT COUNT(*) FROM analytics.conversations WHERE {where}")
    total = (await db.execute(count_sql, params)).scalar_one()

    list_sql = text(f"""
        SELECT
            c.id,
            c.recording_id,
            c.seller_id,
            c.store_id,
            c.session_date,
            c.overall_score,
            c.outcome,
            c.analyzed_at,
            EXISTS(
                SELECT 1 FROM analytics.conversation_script_results csr
                WHERE csr.conversation_id = c.id AND cardinality(csr.violations) > 0
            ) AS has_violations
        FROM analytics.conversations c
        WHERE {where}
        ORDER BY c.session_date DESC, c.analyzed_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = (await db.execute(list_sql, params)).fetchall()

    items = [
        {
            "id": r.id,
            "recording_id": r.recording_id,
            "seller_id": r.seller_id,
            "store_id": r.store_id,
            "session_date": str(r.session_date),
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "has_violations": r.has_violations,
            "analyzed_at": r.analyzed_at,
        }
        for r in rows
    ]

    return {"items": items, "total": total}


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, _ = org_store_conditions(user)

    # Get conversation from analytics
    sql = text("""
        SELECT id, recording_id, seller_id, store_id, session_date,
               overall_score, outcome, outcome_confidence, topic, sentiment_avg, analyzed_at
        FROM analytics.conversations
        WHERE id = :conv_id AND organization_id = :org_id
    """)
    row = (await db.execute(sql, {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    recording_id = str(row.recording_id)

    # Fetch transcript from transcription-service in parallel
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            transcript_resp = await client.get(
                f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/transcripts/{recording_id}"
            )
            transcript_data = transcript_resp.json() if transcript_resp.status_code == 200 else {}
        except httpx.HTTPError:
            transcript_data = {}

    # Get script results
    scripts_sql = text("""
        SELECT csr.script_name, csr.script_score, csr.was_applied, csr.violations,
               cs.step_name, cs.score AS step_score, cs.step_detected, cs.evidence_text
        FROM analytics.conversation_script_results csr
        LEFT JOIN analytics.conversation_scores cs ON cs.conversation_id = csr.conversation_id
            AND cs.script_template_id = csr.script_template_id
        WHERE csr.conversation_id = :conv_id
    """)
    script_rows = (await db.execute(scripts_sql, {"conv_id": conversation_id})).fetchall()

    # Build script results
    scripts_map: dict = {}
    for sr in script_rows:
        key = sr.script_name
        if key not in scripts_map:
            scripts_map[key] = {
                "script_name": sr.script_name,
                "script_score": float(sr.script_score) if sr.script_score else None,
                "was_applied": sr.was_applied,
                "violations": sr.violations or [],
                "step_scores": [],
            }
        if sr.step_name:
            scripts_map[key]["step_scores"].append({
                "step_name": sr.step_name,
                "score": float(sr.step_score) if sr.step_score else 0,
                "detected": sr.step_detected,
                "evidence": sr.evidence_text,
            })

    conversation_data = {
        "id": row.id,
        "recording_id": row.recording_id,
        "seller_id": row.seller_id,
        "session_date": str(row.session_date),
        "overall_score": float(row.overall_score) if row.overall_score is not None else None,
        "outcome": row.outcome,
        "outcome_confidence": float(row.outcome_confidence) if row.outcome_confidence else None,
        "topic": row.topic,
        "sentiment_avg": float(row.sentiment_avg) if row.sentiment_avg else None,
        "script_results": list(scripts_map.values()),
    }

    return {
        "conversation": conversation_data,
        "transcript": transcript_data,
        "audio_url": transcript_data.get("audio_url"),
    }
```

### app/routers/export.py
```python
import uuid
import csv
import io
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from minio import Minio
from minio.error import S3Error
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["export"])

EXPORT_BUCKET = "voiceiq-exports"


def _get_minio():
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


@router.get("/export")
async def export_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    conditions = ["organization_id = :org_id", "session_date BETWEEN :date_from AND :date_to"]
    params: dict = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to}

    if effective_store_id:
        conditions.append("store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("seller_id = :seller_id")
        params["seller_id"] = seller_id

    where = " AND ".join(conditions)
    sql = text(f"""
        SELECT id, recording_id, seller_id, store_id, session_date,
               overall_score, outcome, topic, analyzed_at
        FROM analytics.conversations
        WHERE {where}
        ORDER BY session_date DESC
    """)
    rows = (await db.execute(sql, params)).fetchall()

    # Build CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "recording_id", "seller_id", "store_id", "session_date",
        "overall_score", "outcome", "topic", "analyzed_at",
    ])
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "id": row.id,
            "recording_id": row.recording_id,
            "seller_id": row.seller_id,
            "store_id": row.store_id,
            "session_date": row.session_date,
            "overall_score": row.overall_score,
            "outcome": row.outcome,
            "topic": row.topic,
            "analyzed_at": row.analyzed_at,
        })

    csv_bytes = output.getvalue().encode("utf-8-sig")
    export_id = str(uuid.uuid4())
    filename = f"voiceiq_export_{date_to}.csv"
    object_name = f"{org_id}/{export_id}.csv"

    minio_client = _get_minio()
    try:
        minio_client.make_bucket(EXPORT_BUCKET)
    except S3Error:
        pass

    minio_client.put_object(
        EXPORT_BUCKET,
        object_name,
        io.BytesIO(csv_bytes),
        length=len(csv_bytes),
        content_type="text/csv",
    )

    from datetime import timedelta as td
    url = minio_client.presigned_get_object(EXPORT_BUCKET, object_name, expires=td(hours=1))

    return {"url": url, "expires_in": 3600, "filename": filename}
```

### app/routers/alert_settings.py
```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/dashboard/alerts", tags=["alerts"])


class AlertSettingsUpdate(BaseModel):
    score_threshold: Optional[float] = None
    email_recipients: Optional[List[str]] = None
    is_active: Optional[bool] = None
    no_activity_hours: Optional[int] = None


@router.get("")
async def get_alert_settings(
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = user["organization_id"]
    if store_id:
        sql = text("""
            SELECT id, store_id, score_threshold, email_recipients, is_active, no_activity_hours
            FROM admin_schema.alert_settings
            WHERE organization_id = :org_id AND store_id = :store_id
        """)
        row = (await db.execute(sql, {"org_id": uuid.UUID(org_id), "store_id": store_id})).fetchone()
    else:
        sql = text("""
            SELECT id, store_id, score_threshold, email_recipients, is_active, no_activity_hours
            FROM admin_schema.alert_settings
            WHERE organization_id = :org_id AND store_id IS NULL
        """)
        row = (await db.execute(sql, {"org_id": uuid.UUID(org_id)})).fetchone()

    if not row:
        return {"score_threshold": 60.0, "email_recipients": [], "is_active": False, "no_activity_hours": 24}

    return {
        "id": row.id,
        "store_id": row.store_id,
        "score_threshold": float(row.score_threshold),
        "email_recipients": row.email_recipients or [],
        "is_active": row.is_active,
        "no_activity_hours": row.no_activity_hours,
    }
```

### worker/cache_invalidation_worker.py
```python
import asyncio
import json
import logging
import aio_pika
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import AsyncSessionLocal
from app import redis_client as rc
from app.alerts import check_and_send_score_alert

logger = logging.getLogger(__name__)


async def process_cache_invalidate_message(message: aio_pika.IncomingMessage):
    async with message.process():
        try:
            payload = json.loads(message.body)
            store_id = payload["store_id"]
            org_id = payload["organization_id"]
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Invalid cache invalidation message: %s", e)
            return

        # Invalidate cache
        await rc.invalidate_store_cache(org_id, store_id)
        logger.info("Invalidated cache for store %s org %s", store_id, org_id)

        # Check alerts
        async with AsyncSessionLocal() as db:
            from sqlalchemy import text
            import uuid

            # Get the latest conversation for this store
            result = await db.execute(
                text("""
                    SELECT overall_score
                    FROM analytics.conversations
                    WHERE store_id = :store_id AND organization_id = :org_id
                    ORDER BY analyzed_at DESC
                    LIMIT 1
                """),
                {"store_id": uuid.UUID(store_id), "org_id": uuid.UUID(org_id)},
            )
            row = result.fetchone()
            if row and row.overall_score is not None:
                await check_and_send_score_alert(
                    org_id=org_id,
                    store_id=store_id,
                    overall_score=float(row.overall_score),
                    db=db,
                )


async def start_consuming():
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    queue = await channel.declare_queue("queue.cache.invalidate", durable=True)
    await queue.consume(process_cache_invalidate_message)
    logger.info("cache_invalidation_worker started")
    await asyncio.Future()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_consuming())
```
