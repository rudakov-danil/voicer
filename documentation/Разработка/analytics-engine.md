# Analytics Engine

## Описание
Микросервис для автоматического анализа трансрибированных разговоров с использованием LLM. Сервис получает задачи из очереди RabbitMQ, выполняет анализ контекста скриптов, расчет баллов продавца по каждому этапу скрипта, определение исхода разговора (покупка/отказ/отложено) и выявление возражений клиента. Результаты сохраняются в PostgreSQL и публикуются сообщение об инвалидации кэша для dashboard-service.

## Принципы работы
Архитектура основана на асинхронной обработке сообщений из RabbitMQ с использованием LLM для анализа. Сервис реализует следующий основной процесс:

1. Получение сообщения из очереди `queue.analyze` содержащего ID записи, трансрибе и продавца
2. Параллельная загрузка трансрибе из transcription-service и списка скриптов из scripts-service
3. Разделение скриптов на обязательные и условные (контекстные)
4. Скрининг условных скриптов: LLM определяет, применим ли скрипт к данному разговору
5. Последовательное выполнение анализа (LLM обрабатывает один запрос за раз):
   - Оценка каждого применимого скрипта с вычислением баллов по этапам
   - Общий анализ разговора: определение исхода, тональности, возражений
6. Расчет итогового балла как взвешенное среднее по всем примененным скриптам
7. Сохранение результатов в БД (разговор, результаты скриптов, баллы этапов, возражения)
8. Публикация события инвалидации кэша для dashboard-service

## Вход / Выход

**Входящие данные:**
- Очередь `queue.analyze`: сообщение с recording_id, transcript_id, seller_id, store_id, organization_id
- HTTP GET от transcription-service: список сегментов трансрибе с текстом и ролью говорящего
- HTTP GET от scripts-service: список скриптов продавца с этапами и весами

**Исходящие данные:**
- PostgreSQL таблицы `analytics.conversations`, `conversation_script_results`, `conversation_scores`, `objections`
- RabbitMQ очередь `queue.cache.invalidate`: сообщение с store_id, organization_id
- HTTP GET ендпоинты: список разговоров, детали разговора, статистика продавца

## Полный код

### app/config.py
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://voiceiq:pass@postgres:5432/voiceiq"
    RABBITMQ_URL: str = "amqp://voiceiq:pass@rabbitmq:5672/"
    # LLM — в dev используется 1BitAI cloud API, в prod — self-hosted GPU
    LLM_SERVER_URL: str = "https://llm.1bitai.ru"
    LLM_API_KEY: str = "1bitai"
    LLM_EXTRA_HEADER_NAME: str = "X-PROXY-AUTH"
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 2000
    LLM_SCRIPT_TIMEOUT: int = 120
    LLM_GENERAL_TIMEOUT: int = 120
    LLM_MAX_PARALLEL_SCRIPTS: int = 1  # последовательно — LLM один запрос за раз
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    SCRIPTS_SERVICE_URL: str = "http://scripts-service:8005"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    INTERNAL_SERVICE_KEY: str = ""  # ключ для X-Internal-Key заголовка

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
```

### app/main.py
```python
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import conversations


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
```

### app/models.py
```python
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    UUID, String, Text, Boolean, Integer, Numeric, Date,
    ForeignKey, UniqueConstraint, Index, TIMESTAMP, ARRAY
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("idx_conversations_org", "organization_id"),
        Index("idx_conversations_store", "store_id"),
        Index("idx_conversations_seller", "seller_id"),
        Index("idx_conversations_date", "session_date"),
        Index("idx_conversations_score", "overall_score"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recording_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    transcript_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    store_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    outcome_confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    topic: Mapped[str | None] = mapped_column(String(500))
    sentiment_avg: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    analyzed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    llm_model: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="analyzed")

    script_results: Mapped[list["ConversationScriptResult"]] = relationship(
        "ConversationScriptResult", back_populates="conversation", cascade="all, delete-orphan"
    )
    scores: Mapped[list["ConversationScore"]] = relationship(
        "ConversationScore", back_populates="conversation", cascade="all, delete-orphan"
    )
    objections: Mapped[list["Objection"]] = relationship(
        "Objection", back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationScriptResult(Base):
    __tablename__ = "conversation_script_results"
    __table_args__ = (
        UniqueConstraint("conversation_id", "script_template_id"),
        Index("idx_script_results_conversation", "conversation_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    script_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    script_name: Mapped[str] = mapped_column(String(255), nullable=False)
    was_applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    script_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    violations: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    skip_reason: Mapped[str | None] = mapped_column(Text)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="script_results")


class ConversationScore(Base):
    __tablename__ = "conversation_scores"
    __table_args__ = (
        UniqueConstraint("conversation_id", "script_step_id"),
        Index("idx_conv_scores_conversation", "conversation_id"),
        Index("idx_conv_scores_template", "script_template_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    script_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    script_step_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    step_name: Mapped[str] = mapped_column(String(255), nullable=False)
    step_weight: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    evidence_text: Mapped[str | None] = mapped_column(Text)
    step_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="scores")


class Objection(Base):
    __tablename__ = "objections"
    __table_args__ = (
        Index("idx_objections_conversation", "conversation_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resolution_technique: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="objections")
```

### app/llm_client.py
```python
from openai import AsyncOpenAI
from app.config import settings

_client: AsyncOpenAI | None = None


def get_llm_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key="ollama",
            base_url=f"{settings.LLM_SERVER_URL}/v1",
        )
    return _client
```

### app/prompt_builder.py
```python
import json
from openai import AsyncOpenAI
from app.config import settings

SCRIPT_SCORING_SYSTEM_PROMPT = """Ты — эксперт по продажам в розничном магазине.
Тебе дан диаризованный транскрипт разговора продавца с клиентом.

Скрипт продаж «{script_name}» содержит следующие этапы:
{script_steps}

Проанализируй, насколько продавец соблюдал этот скрипт, и верни СТРОГО валидный JSON:
{{
  "step_scores": [
    {{
      "step_id": "<UUID этапа>",
      "step_name": "<название этапа>",
      "score": <0—100>,
      "detected": <true|false>,
      "evidence": "<цитата из транскрипта или пустая строка>"
    }}
  ],
  "violations": ["<нарушение 1>", ...]
}}

Правила:
- score=0 если этап не был выполнен вообще
- detected=false если этап отсутствовал полностью
- violations — только то, что реально нарушено, не придумывай
- evidence — прямая цитата из транскрипта, не перефразируй
"""

SCREENING_SYSTEM_PROMPT = """Определи, применим ли данный скрипт продаж к данному разговору.
Описание контекста скрипта: {context_description}
Ответь СТРОГО валидным JSON: {{"applicable": true|false, "reason": "краткое обоснование"}}
Отвечай conservative: если разговор явно не про описанный контекст — applicable=false."""

GENERAL_ANALYSIS_SYSTEM_PROMPT = """Ты — эксперт по продажам в розничном магазине.
Проанализируй разговор и верни СТРОГО валидный JSON:
{{
  "outcome": "<purchase|deferred|price_refusal|competitor|unknown>",
  "outcome_confidence": <0.0—1.0>,
  "topic": "<название товара или null>",
  "sentiment_avg": <-1.0 до 1.0>,
  "objections": [
    {{
      "type": "<price|quality|competitors|timing|trust|not_ready|functionality>",
      "is_resolved": <true|false>,
      "resolution_technique": "<техника или null>",
      "raw_text": "<фраза клиента>"
    }}
  ]
}}
"""


MAX_SEGMENTS_FOR_LLM = 80


def _format_transcript(segments: list[dict], max_segments: int = MAX_SEGMENTS_FOR_LLM) -> str:
    # Limit segments to avoid huge prompts on slow CPU-based LLMs
    if len(segments) > max_segments:
        step = len(segments) / max_segments
        segments = [segments[int(i * step)] for i in range(max_segments)]
    lines = []
    for seg in segments:
        role = "ПРОДАВЕЦ" if seg.get("speaker_role") == "seller" else "КЛИЕНТ"
        time_s = seg.get("start_ms", 0) // 1000
        lines.append(f"{role} [{time_s}с]: {seg.get('text', '')}")
    return "Транскрипт разговора:\n" + "\n".join(lines)


def build_script_prompt(transcript_segments: list[dict], script: dict) -> tuple[str, str]:
    steps_text = "\n".join(
        f"- ID={step['id']} | {step['name']} (вес {step['weight']}): {step.get('description', '')}"
        for step in sorted(script["steps"], key=lambda s: s["step_order"])
    )
    system = SCRIPT_SCORING_SYSTEM_PROMPT.format(
        script_name=script["name"],
        script_steps=steps_text,
    )
    user = _format_transcript(transcript_segments)
    return system, user


def build_general_prompt(transcript_segments: list[dict]) -> tuple[str, str]:
    return GENERAL_ANALYSIS_SYSTEM_PROMPT, _format_transcript(transcript_segments)


async def screen_contextual_script(
    transcript_segments: list[dict],
    script: dict,
    llm_client: AsyncOpenAI,
) -> tuple[bool, str]:
    if not script.get("context_description"):
        return True, "no context filter"

    system = SCREENING_SYSTEM_PROMPT.format(context_description=script["context_description"])
    user = _format_transcript(transcript_segments)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=200,
            response_format={"type": "json_object"},
            timeout=30,
        )
        data = json.loads(response.choices[0].message.content)
        return bool(data.get("applicable", False)), data.get("reason", "")
    except Exception as e:
        return False, f"LLM_PARSE_ERROR: {e}"
```

### app/rabbitmq.py
```python
import json
import aio_pika
from app.config import settings

_connection: aio_pika.RobustConnection | None = None
_channel: aio_pika.Channel | None = None


async def get_channel() -> aio_pika.Channel:
    global _connection, _channel
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    if _channel is None or _channel.is_closed:
        _channel = await _connection.channel()
    return _channel


async def publish(queue_name: str, payload: dict) -> None:
    channel = await get_channel()
    await channel.declare_queue(queue_name, durable=True)
    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(payload).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        ),
        routing_key=queue_name,
    )


async def close() -> None:
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _connection = None
    _channel = None
```

### app/response_parser.py
```python
import json
from typing import Optional
from pydantic import BaseModel, Field


class StepScoreSchema(BaseModel):
    step_id: str
    step_name: str
    score: float = Field(ge=0.0, le=100.0)
    detected: bool
    evidence: str = ""


class ScriptScoringResponse(BaseModel):
    step_scores: list[StepScoreSchema]
    violations: list[str] = []


class ObjectionSchema(BaseModel):
    type: str
    is_resolved: bool
    resolution_technique: Optional[str] = None
    raw_text: str


class GeneralAnalysisResponse(BaseModel):
    outcome: str = Field(pattern=r"^(purchase|deferred|price_refusal|competitor|unknown)$")
    outcome_confidence: float = Field(ge=0.0, le=1.0)
    topic: Optional[str] = None
    sentiment_avg: float = Field(ge=-1.0, le=1.0)
    objections: list[ObjectionSchema] = []


class LLMResponseParseError(Exception):
    pass


def parse_script_scoring_response(raw: str) -> ScriptScoringResponse:
    try:
        return ScriptScoringResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e


def parse_general_analysis_response(raw: str) -> GeneralAnalysisResponse:
    try:
        return GeneralAnalysisResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse general analysis: {e}") from e
```

### app/scorer.py
```python
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional


def calculate_script_score(step_scores: list[dict], script_steps: list[dict]) -> float:
    """Weighted sum of step scores. Returns 0.0—100.0"""
    weights_map = {step["id"]: Decimal(str(step["weight"])) for step in script_steps}
    scores_map = {s["step_id"]: Decimal(str(s["score"])) for s in step_scores}

    total_weight = Decimal("0")
    weighted_sum = Decimal("0")
    for step_id, weight in weights_map.items():
        score = scores_map.get(step_id, Decimal("0"))
        weighted_sum += weight * score
        total_weight += weight

    if total_weight == Decimal("0"):
        return 0.0
    result = weighted_sum / total_weight * Decimal("100")
    return float(result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_overall_score(script_scores: list[float]) -> Optional[float]:
    """Average across all scripts. None if empty."""
    if not script_scores:
        return None
    avg = sum(script_scores) / len(script_scores)
    return round(avg, 2)
```

### app/routers/conversations.py
```python
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Conversation, ConversationScriptResult, ConversationScore, Objection
from app.config import settings
import httpx

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


def _org_filter(user: dict):
    org_id = uuid.UUID(user["organization_id"])
    role = user["role"]
    conditions = [Conversation.organization_id == org_id]
    if role == "manager":
        if user.get("store_id"):
            conditions.append(Conversation.store_id == uuid.UUID(user["store_id"]))
    return conditions


@router.get("/conversations")
async def list_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    outcome: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = _org_filter(user)
    if store_id:
        conditions.append(Conversation.store_id == store_id)
    if seller_id:
        conditions.append(Conversation.seller_id == seller_id)
    if date_from:
        conditions.append(Conversation.session_date >= date_from)
    if date_to:
        conditions.append(Conversation.session_date <= date_to)
    if outcome:
        conditions.append(Conversation.outcome == outcome)

    q = select(Conversation).where(and_(*conditions))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    conversations = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    items = []
    for c in conversations:
        items.append({
            "id": c.id,
            "recording_id": c.recording_id,
            "seller_id": c.seller_id,
            "store_id": c.store_id,
            "session_date": c.session_date,
            "overall_score": float(c.overall_score) if c.overall_score is not None else None,
            "outcome": c.outcome,
            "scripts_count": len(c.script_results),
            "analyzed_at": c.analyzed_at,
        })

    return {"items": items, "total": total}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build script_results with step scores
    script_results = []
    for sr in conv.script_results:
        step_scores = [
            s for s in conv.scores
            if s.script_template_id == sr.script_template_id
        ]
        script_results.append({
            "script_template_id": sr.script_template_id,
            "script_name": sr.script_name,
            "was_applied": sr.was_applied,
            "script_score": float(sr.script_score) if sr.script_score is not None else None,
            "violations": sr.violations or [],
            "skip_reason": sr.skip_reason,
            "step_scores": [
                {
                    "step_name": s.step_name,
                    "weight": float(s.step_weight),
                    "score": float(s.score),
                    "detected": s.step_detected,
                    "evidence": s.evidence_text,
                }
                for s in sorted(step_scores, key=lambda x: x.step_name)
            ],
        })

    return {
        "id": conv.id,
        "recording_id": conv.recording_id,
        "overall_score": float(conv.overall_score) if conv.overall_score is not None else None,
        "outcome": conv.outcome,
        "outcome_confidence": float(conv.outcome_confidence) if conv.outcome_confidence is not None else None,
        "topic": conv.topic,
        "sentiment_avg": float(conv.sentiment_avg) if conv.sentiment_avg is not None else None,
        "script_results": script_results,
        "objections": [
            {
                "type": o.type,
                "is_resolved": o.is_resolved,
                "resolution_technique": o.resolution_technique,
                "raw_text": o.raw_text,
            }
            for o in sorted(conv.objections, key=lambda x: x.sort_order)
        ],
    }


@router.get("/sellers/{seller_id}/stats")
async def get_seller_stats(
    seller_id: uuid.UUID,
    date_from: date,
    date_to: date,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    conditions = [
        Conversation.organization_id == org_id,
        Conversation.seller_id == seller_id,
        Conversation.session_date >= date_from,
        Conversation.session_date <= date_to,
    ]

    q = select(Conversation).where(and_(*conditions))
    conversations = (await db.execute(q)).scalars().all()

    if not conversations:
        return {
            "seller_id": seller_id,
            "period": {"from": date_from, "to": date_to},
            "total_conversations": 0,
            "avg_overall_score": None,
            "conversion_rate": 0.0,
            "score_trend": [],
            "script_breakdown": [],
        }

    total = len(conversations)
    scores = [float(c.overall_score) for c in conversations if c.overall_score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else None
    purchases = sum(1 for c in conversations if c.outcome == "purchase")
    conversion_rate = round(purchases / total, 4) if total else 0.0

    # Score trend by date
    trend_map: dict = {}
    for c in conversations:
        d = str(c.session_date)
        if c.overall_score is not None:
            trend_map.setdefault(d, []).append(float(c.overall_score))
    score_trend = [
        {"date": d, "avg_score": round(sum(v) / len(v), 2)}
        for d, v in sorted(trend_map.items())
    ]

    # Script breakdown
    script_map: dict = {}
    for c in conversations:
        for sr in c.script_results:
            if not sr.was_applied or sr.script_score is None:
                continue
            key = str(sr.script_template_id)
            script_map.setdefault(key, {"name": sr.script_name, "scores": [], "steps": {}})
            script_map[key]["scores"].append(float(sr.script_score))
            for s in c.scores:
                if s.script_template_id == sr.script_template_id:
                    sname = s.step_name
                    script_map[key]["steps"].setdefault(sname, []).append(float(s.score))

    script_breakdown = []
    for info in script_map.values():
        step_averages = [
            {"step_name": sname, "avg_score": round(sum(svs) / len(svs), 2)}
            for sname, svs in info["steps"].items()
        ]
        script_breakdown.append({
            "script_name": info["name"],
            "avg_score": round(sum(info["scores"]) / len(info["scores"]), 2),
            "step_averages": step_averages,
        })

    return {
        "seller_id": seller_id,
        "period": {"from": date_from, "to": date_to},
        "total_conversations": total,
        "avg_overall_score": avg_score,
        "conversion_rate": conversion_rate,
        "score_trend": score_trend,
        "script_breakdown": script_breakdown,
    }


@router.post("/reanalyze/{recording_id}", status_code=202)
async def reanalyze(
    recording_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Find conversation
    result = await db.execute(
        select(Conversation).where(Conversation.recording_id == recording_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete old detail records (cascade handles scores/objections)
    await db.execute(
        delete(ConversationScriptResult).where(ConversationScriptResult.conversation_id == conv.id)
    )
    await db.commit()

    # Publish reanalyze task
    from app.rabbitmq import publish
    await publish("queue.analyze", {
        "recording_id": str(conv.recording_id),
        "transcript_id": str(conv.transcript_id),
        "seller_id": str(conv.seller_id),
        "store_id": str(conv.store_id),
        "organization_id": str(conv.organization_id),
    })

    return {"status": "queued", "recording_id": recording_id}
```

### worker/analyze_worker.py
```python
import asyncio
import json
import logging
import uuid
from datetime import date, datetime

import aio_pika
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.llm_client import get_llm_client
from app.models import Conversation, ConversationScriptResult, ConversationScore, Objection
from app.prompt_builder import build_script_prompt, build_general_prompt, screen_contextual_script
from app.rabbitmq import publish
from app.response_parser import (
    parse_script_scoring_response,
    parse_general_analysis_response,
    LLMResponseParseError,
)
from app.scorer import calculate_script_score, calculate_overall_score

logger = logging.getLogger(__name__)


async def _fetch_transcript(recording_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/transcripts/{recording_id}"
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("segments", [])


async def _fetch_scripts(seller_id: str, organization_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/for-seller",
            params={"seller_id": seller_id, "organization_id": organization_id},
        )
        resp.raise_for_status()
        return resp.json().get("scripts", [])


async def _score_one_script(segments: list[dict], script: dict, llm_client) -> dict:
    """Score a single script. Returns dict with script_id, script_score, step_scores, violations."""
    system, user = build_script_prompt(segments, script)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_SCRIPT_TIMEOUT,
        )
        parsed = parse_script_scoring_response(response.choices[0].message.content)
        step_scores = [{"step_id": s.step_id, "score": s.score} for s in parsed.step_scores]
        score = calculate_script_score(step_scores, script["steps"])
        return {
            "script_id": script["id"],
            "script_name": script["name"],
            "script_score": score,
            "step_scores": parsed.step_scores,
            "violations": parsed.violations,
            "error": False,
        }
    except LLMResponseParseError as e:
        logger.error("LLM parse error for script %s: %s", script["id"], e)
        return {
            "script_id": script["id"],
            "script_name": script["name"],
            "script_score": 0.0,
            "step_scores": [],
            "violations": ["LLM_PARSE_ERROR"],
            "error": True,
        }


async def _general_analysis(segments: list[dict], llm_client) -> dict:
    system, user = build_general_prompt(segments)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        parsed = parse_general_analysis_response(response.choices[0].message.content)
        return {
            "outcome": parsed.outcome,
            "outcome_confidence": parsed.outcome_confidence,
            "topic": parsed.topic,
            "sentiment_avg": parsed.sentiment_avg,
            "objections": [o.model_dump() for o in parsed.objections],
        }
    except (LLMResponseParseError, Exception) as e:
        logger.error("General analysis failed: %s", e)
        return {
            "outcome": "unknown",
            "outcome_confidence": 0.0,
            "topic": None,
            "sentiment_avg": 0.0,
            "objections": [],
        }


async def _run_parallel_with_limit(coros, limit: int):
    """Run coroutines with concurrency limit."""
    semaphore = asyncio.Semaphore(limit)

    async def bounded(coro):
        async with semaphore:
            return await coro

    return await asyncio.gather(*[bounded(c) for c in coros])


async def process_analyze_message(
    message: aio_pika.IncomingMessage,
    db: AsyncSession,
    llm_client,
):
    async with message.process(requeue=True):
        try:
            payload = json.loads(message.body)
            recording_id = payload["recording_id"]
            transcript_id = payload["transcript_id"]
            seller_id = payload["seller_id"]
            store_id = payload["store_id"]
            organization_id = payload["organization_id"]
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Invalid message format: %s", e)
            return  # ACK bad message, don't retry

        # Step 1: Fetch transcript and scripts in parallel
        try:
            segments, scripts = await asyncio.gather(
                _fetch_transcript(recording_id),
                _fetch_scripts(seller_id, organization_id),
            )
        except httpx.HTTPError as e:
            logger.error("Failed to fetch data: %s", e)
            raise  # Will NACK and requeue

        # Step 2: Split mandatory vs contextual
        mandatory_scripts = [s for s in scripts if s.get("is_mandatory")]
        contextual_scripts = [s for s in scripts if not s.get("is_mandatory")]

        # Step 3: Screen contextual scripts
        screening_coros = [
            screen_contextual_script(segments, script, llm_client)
            for script in contextual_scripts
        ]
        screening_results = await _run_parallel_with_limit(
            screening_coros, settings.LLM_MAX_PARALLEL_SCRIPTS
        )

        applied_contextual = []
        skipped_contextual = []
        for script, (applicable, reason) in zip(contextual_scripts, screening_results):
            if applicable:
                applied_contextual.append(script)
            else:
                skipped_contextual.append((script, reason))

        # Step 4: Score applied scripts + general analysis in parallel
        scripts_to_score = mandatory_scripts + applied_contextual
        scoring_coros = [
            _score_one_script(segments, script, llm_client)
            for script in scripts_to_score
        ]
        general_coro = _general_analysis(segments, llm_client)

        if scoring_coros:
            scored_results, general = await asyncio.gather(
                _run_parallel_with_limit(scoring_coros, settings.LLM_MAX_PARALLEL_SCRIPTS),
                general_coro,
            )
        else:
            scored_results = []
            general = await general_coro

        # Step 5: Calculate overall score (only from applied scripts)
        applied_scores = [r["script_score"] for r in scored_results]
        overall_score = calculate_overall_score(applied_scores)

        # Step 6: Save to DB in one transaction
        # Determine session_date from transcript or use today
        session_date_val = date.today()

        conv = Conversation(
            recording_id=uuid.UUID(recording_id),
            transcript_id=uuid.UUID(transcript_id),
            organization_id=uuid.UUID(organization_id),
            store_id=uuid.UUID(store_id),
            seller_id=uuid.UUID(seller_id),
            session_date=session_date_val,
            overall_score=overall_score,
            outcome=general["outcome"],
            outcome_confidence=general["outcome_confidence"],
            topic=general["topic"],
            sentiment_avg=general["sentiment_avg"],
            analyzed_at=datetime.utcnow(),
            llm_model=settings.LLM_MODEL_NAME,
        )
        db.add(conv)
        await db.flush()

        # Applied script results
        for result in scored_results:
            sr = ConversationScriptResult(
                conversation_id=conv.id,
                script_template_id=uuid.UUID(result["script_id"]),
                script_name=result["script_name"],
                was_applied=True,
                script_score=result["script_score"],
                violations=result["violations"],
            )
            db.add(sr)

            # Step scores
            script_obj = next(
                (s for s in scripts_to_score if s["id"] == result["script_id"]), None
            )
            if script_obj:
                step_map = {s["id"]: s for s in script_obj["steps"]}
                for ss in result["step_scores"]:
                    step_info = step_map.get(ss.step_id, {})
                    cs = ConversationScore(
                        conversation_id=conv.id,
                        script_template_id=uuid.UUID(result["script_id"]),
                        script_step_id=uuid.UUID(ss.step_id),
                        step_name=ss.step_name,
                        step_weight=step_info.get("weight", 0),
                        score=ss.score,
                        evidence_text=ss.evidence or None,
                        step_detected=ss.detected,
                    )
                    db.add(cs)

        # Skipped contextual scripts
        for script, skip_reason in skipped_contextual:
            sr = ConversationScriptResult(
                conversation_id=conv.id,
                script_template_id=uuid.UUID(script["id"]),
                script_name=script["name"],
                was_applied=False,
                script_score=None,
                violations=[],
                skip_reason=skip_reason,
            )
            db.add(sr)

        # Objections
        for i, obj in enumerate(general.get("objections", [])):
            db.add(Objection(
                conversation_id=conv.id,
                type=obj["type"],
                is_resolved=obj["is_resolved"],
                resolution_technique=obj.get("resolution_technique"),
                raw_text=obj["raw_text"],
                sort_order=i,
            ))

        await db.commit()

        # Step 7: Publish cache invalidation
        await publish("queue.cache.invalidate", {
            "store_id": store_id,
            "organization_id": organization_id,
        })

        logger.info("Analyzed recording %s, overall_score=%s", recording_id, overall_score)


async def start_consuming():
    import aio_pika
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue("queue.analyze", durable=True)
    llm_client = get_llm_client()

    async def on_message(message: aio_pika.IncomingMessage):
        async with AsyncSessionLocal() as db:
            await process_analyze_message(message, db, llm_client)

    await queue.consume(on_message)
    logger.info("analyze_worker started, consuming queue.analyze")
    # Keep running
    await asyncio.Future()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_consuming())
```
