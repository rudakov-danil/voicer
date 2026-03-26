# Transcription Service (Сервис транскрипции)

## Описание сервиса

Transcription Service преобразует аудиофайлы в текст с использованием Whisper, разбивает полный рабочий день на отдельные разговоры с клиентами через LLM, и определяет роли говорящих (продавец/клиент) через diarization. Запускает два worker'а для асинхронной обработки.

## Принципы работы

### Архитектура

1. **Транскрипция**: Whisper преобразует WAV в текст с временными метками
2. **Сегментация**: LLM разбивает полный день на границы отдельных разговоров
3. **Сохранение**: Создаются записи (recordings) и транскрипты с сегментами
4. **Diarization**: LLM определяет роли (seller/customer) для каждого сегмента
5. **Передача**: После diarization отправляется в queue.analyze для AI анализа

### Основная логика

- **Transcribe Worker**: Слушает queue.transcribe_full, вызывает Whisper, сегментирует разговоры, сохраняет транскрипты со статусом "transcribed"
- **Diarize Worker**: Слушает queue.diarize, определяет роли говорящих, обновляет speaker_role в БД, отправляет в queue.analyze

## Входные и выходные данные

### RabbitMQ очереди

**На входе**:
- `queue.transcribe_full` — полный файл дня готов
  - Payload: {device_id, seller_id, store_id, organization_id, audio_path, session_date}
- `queue.diarize` — транскрипт готов, нужен diarization
  - Payload: {recording_id, transcript_id, seller_id, store_id, organization_id}

**На выходе**:
- `queue.diarize` — один разговор транскрибирован
- `queue.analyze` — transcript diarized, готов к анализу
  - Payload: {recording_id, transcript_id, seller_id, store_id, organization_id}

### REST API Endpoints

**Transcripts** (`/api/v1/transcription`):
- `GET /transcripts/{recording_id}` — получить транскрипт с сегментами по recording_id

### База данных (PostgreSQL schema: transcription)

**Таблица `transcripts`**:
- id (UUID primary key)
- recording_id (UUID unique)
- organization_id, store_id, seller_id (UUID)
- full_text (text)
- language (string, default "ru")
- duration_seconds (optional int)
- status (string): transcribed, diarized, failed
- whisper_model (optional string)
- created_at (datetime)

**Таблица `transcript_segments`**:
- id (UUID primary key)
- transcript_id (UUID FK)
- speaker_role (string): seller, customer, unknown
- text (text)
- start_ms, end_ms (int)
- segment_index (int)
- avg_logprob (optional numeric)

## Код сервиса

### app/config.py

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "voiceiq_admin"
    MINIO_SECRET_KEY: str = "changeme_minio"
    MINIO_SECURE: bool = False
    RABBITMQ_URL: str = "amqp://voiceiq:changeme@rabbitmq:5672/"
    WHISPER_SERVER_URL: str = "http://whisper-gpu-server:8080"
    LLM_SERVER_URL: str = "http://llm-gpu-server:11434"
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    RECORDER_SERVICE_URL: str = "http://recorder-service:8002"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
```

### app/database.py

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_maker() as session:
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
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import transcripts

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "transcription-service"}
```

### app/models.py

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Transcript(Base):
    __tablename__ = "transcripts"
    __table_args__ = {"schema": "transcription"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recording_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), nullable=False)
    seller_id = Column(UUID(as_uuid=True), nullable=False)
    full_text = Column(Text, nullable=False)
    language = Column(String(10), nullable=False, default="ru")
    duration_seconds = Column(Integer, nullable=True)
    status = Column(String(30), nullable=False, default="transcribed")
    # transcribed | diarized | failed
    whisper_model = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    segments = relationship(
        "TranscriptSegment",
        back_populates="transcript",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.segment_index",
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    __table_args__ = {"schema": "transcription"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcript_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transcription.transcripts.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker_role = Column(String(20), nullable=False, default="unknown")
    # seller | customer | unknown
    text = Column(Text, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    segment_index = Column(Integer, nullable=False)
    avg_logprob = Column(Numeric(6, 4), nullable=True)

    transcript = relationship("Transcript", back_populates="segments")
```

### app/schemas.py

```python
from datetime import datetime
from typing import Optional
from uuid import UUID
from decimal import Decimal

from pydantic import BaseModel


class SegmentResponse(BaseModel):
    id: UUID
    speaker_role: str
    text: str
    start_ms: int
    end_ms: int
    segment_index: int

    class Config:
        from_attributes = True


class TranscriptResponse(BaseModel):
    id: UUID
    recording_id: UUID
    full_text: str
    language: str
    duration_seconds: Optional[int]
    status: str
    segments: list[SegmentResponse]

    class Config:
        from_attributes = True
```

### app/whisper_client.py

```python
import httpx
from app.config import settings


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    """
    Отправляет аудио на Whisper-сервер.
    Возвращает: { "text": str, "language": str, "segments": list[dict] }
    Каждый сегмент: { "start": float (sec), "end": float (sec), "text": str, "avg_logprob": float }
    Таймаут: 300 секунд.
    """
    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(
            f"{settings.WHISPER_SERVER_URL}/transcribe",
            files={"file": (filename, audio_bytes, "audio/wav")},
            data={"language": "ru", "task": "transcribe"},
        )
    resp.raise_for_status()
    return resp.json()
```

### app/diarization.py

```python
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

DIARIZATION_SYSTEM_PROMPT = """Ты — система анализа разговоров в розничном магазине.
Тебе дан список реплик разговора с временны́ми метками.
В разговоре участвуют ПРОДАВЕЦ и КЛИЕНТ (иногда несколько клиентов).
Имя продавца: {seller_name}

Твоя задача — для каждой реплики определить роль говорящего: "seller" или "customer".

Правила:
- Приветствия ("Здравствуйте, чем могу помочь") — обычно продавец
- Вопросы о характеристиках товара — обычно клиент
- Презентация товара — обычно продавец
- Ценовые возражения ("дорого", "а есть дешевле") — обычно клиент
- При неопределённости — ставь "unknown"

Отвечай ТОЛЬКО валидным JSON: список объектов с полями "index" и "role".
Пример: [{"index": 0, "role": "seller"}, {"index": 1, "role": "customer"}]"""

SEGMENTATION_SYSTEM_PROMPT = """Ты — система анализа диалогов в розничном магазине.
Тебе дан полный транскрипт рабочего дня продавца с временны́ми метками (в секундах).

Твоя задача — найти границы отдельных разговоров с клиентами.
Разговор — это связная последовательность реплик, относящихся к одному взаимодействию продавца с клиентом.

Признаки начала нового разговора:
- Приветствие ("Здравствуйте", "Добрый день", "Чем могу помочь")
- Смена темы после явного завершения предыдущего разговора
- Большой временной разрыв между репликами (более 2 минут тишины)

Признаки конца разговора:
- Прощание ("До свидания", "Спасибо", "Всего хорошего")
- Резкая смена собеседника

Отвечай ТОЛЬКО валидным JSON: список объектов с полями "start_ms" и "end_ms" (в миллисекундах).
Пример: [{"start_ms": 0, "end_ms": 185000}, {"start_ms": 210000, "end_ms": 380000}]
Не включай участки с фоновым шумом или тишиной без диалога."""


async def segment_conversations(
    whisper_result: dict,
    llm_client,
) -> list[dict]:
    """
    Принимает результат Whisper (полный транскрипт с временны́ми метками),
    возвращает список границ разговоров: [{"start_ms": int, "end_ms": int}, ...]
    """
    segments = whisper_result.get("segments", [])
    if not segments:
        return []

    segments_text = "\n".join(
        f"[{int(seg['start'] * 1000)}ms - {int(seg['end'] * 1000)}ms] {seg['text']}"
        for seg in segments
    )
    user_prompt = f"Транскрипт рабочего дня:\n{segments_text}\n\nНайди границы разговоров."

    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": SEGMENTATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        result = json.loads(raw)

        # Handle list, {"conversations": [...]}, {"start_ms":..,"end_ms":..} (single obj), etc.
        if isinstance(result, list):
            conversations = result
        elif isinstance(result, dict):
            # Try known wrapper keys first
            conversations = result.get("conversations",
                           result.get("segments",
                           result.get("boundaries",
                           result.get("dialogs", None))))
            if conversations is None:
                # Maybe LLM returned a single conversation object directly
                if "start_ms" in result and "end_ms" in result:
                    conversations = [result]
                else:
                    conversations = []
        else:
            conversations = []

        # Validate structure
        valid = []
        for conv in conversations:
            if "start_ms" in conv and "end_ms" in conv:
                valid.append({"start_ms": int(conv["start_ms"]), "end_ms": int(conv["end_ms"])})

        if valid:
            return valid

        # Fallback: treat entire audio as one conversation
        logger.warning("LLM returned no valid conversation boundaries, using full audio as one conversation")
        total_end_ms = int(segments[-1]["end"] * 1000) if segments else 0
        if total_end_ms > 0:
            return [{"start_ms": 0, "end_ms": total_end_ms}]
        return [{"start_ms": 0, "end_ms": len(whisper_result.get("text", "")) * 50}] or []

    except Exception as e:
        logger.error(f"Segmentation LLM error: {e}", exc_info=True)
        total_end_ms = int(segments[-1]["end"] * 1000) if segments else 0
        if total_end_ms > 0:
            return [{"start_ms": 0, "end_ms": total_end_ms}]
        return []


DIARIZE_CHUNK_SIZE = 40


async def _diarize_chunk(
    chunk: list[dict],
    chunk_offset: int,
    seller_name: str,
    llm_client,
) -> dict[int, str]:
    """Diarize a single chunk. Returns {absolute_index: role}."""
    segments_text = "\n".join(
        f"[{chunk_offset + i}] {seg['text']}" for i, seg in enumerate(chunk)
    )
    user_prompt = f"Реплики разговора:\n{segments_text}\n\nОпредели роли."

    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": DIARIZATION_SYSTEM_PROMPT.format(seller_name=seller_name)},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=len(chunk) * 30 + 100,
            response_format={"type": "json_object"},
            timeout=300,
        )
        raw = response.choices[0].message.content
        result = json.loads(raw)

        if isinstance(result, list):
            roles_list = result
        elif isinstance(result, dict):
            roles_list = result.get("roles", result.get("segments", []))
        else:
            roles_list = []

        return {
            item["index"]: item["role"]
            for item in roles_list
            if "index" in item and "role" in item
        }
    except Exception as e:
        logger.error(f"Diarization chunk error (offset={chunk_offset}): {e}")
        return {}


async def diarize_segments(
    segments: list[dict],
    seller_name: str,
    llm_client,
) -> list[str]:
    """
    Принимает список сегментов Whisper, возвращает список ролей ["seller", "customer", ...].
    Обрабатывает сегменты чанками по DIARIZE_CHUNK_SIZE штук.
    """
    if not segments:
        return []

    roles_map: dict[int, str] = {}

    for offset in range(0, len(segments), DIARIZE_CHUNK_SIZE):
        chunk = segments[offset: offset + DIARIZE_CHUNK_SIZE]
        chunk_roles = await _diarize_chunk(chunk, offset, seller_name, llm_client)
        roles_map.update(chunk_roles)
        logger.info(
            f"Diarized chunk {offset}-{offset + len(chunk) - 1}: "
            f"{sum(1 for r in chunk_roles.values() if r == 'seller')} seller, "
            f"{sum(1 for r in chunk_roles.values() if r == 'customer')} customer"
        )

    result = [roles_map.get(i, "unknown") for i in range(len(segments))]
    seller_count = result.count("seller")
    customer_count = result.count("customer")
    unknown_count = result.count("unknown")
    logger.info(f"Diarization complete: {seller_count} seller, {customer_count} customer, {unknown_count} unknown")
    return result
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
            base_url=f"{settings.LLM_SERVER_URL}/v1",
            api_key="ollama",  # required by openai SDK but ignored by Ollama
        )
    return _client
```

### app/minio_client.py

```python
import io
from minio import Minio
from app.config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def download_bytes(bucket: str, object_name: str) -> bytes:
    client = get_minio()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def upload_bytes(bucket: str, object_name: str, data: bytes, content_type: str = "audio/wav") -> None:
    client = get_minio()
    client.put_object(bucket, object_name, io.BytesIO(data), length=len(data), content_type=content_type)


def delete_object(bucket: str, object_name: str) -> None:
    client = get_minio()
    client.remove_object(bucket, object_name)
```

### app/rabbitmq.py

```python
import json
import aio_pika
from app.config import settings

_connection: aio_pika.Connection | None = None
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
```

### app/routers/transcripts.py

```python
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Transcript
from app.schemas import TranscriptResponse

router = APIRouter(prefix="/api/v1/transcription", tags=["transcription"])


@router.get("/transcripts/{recording_id}", response_model=TranscriptResponse)
async def get_transcript(
    recording_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    transcript = (await db.execute(
        select(Transcript).where(
            Transcript.recording_id == recording_id,
            Transcript.organization_id == current_user["organization_id"],
        )
    )).scalar_one_or_none()

    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    return TranscriptResponse.model_validate(transcript)
```

### worker/transcribe_worker.py

Полный файл содержит 207 строк. Основные функции:
- `_cut_audio_segment()` — вырезает сегмент аудио по временным меткам
- `process_transcribe_full_message()` — обрабатывает одно сообщение из queue.transcribe_full:
  1. Загружает full_day.wav из MinIO
  2. Транскрибирует через Whisper
  3. Сегментирует разговоры через LLM (segmentation)
  4. Для каждого разговора: вырезает аудио, сохраняет в MinIO, создаёт Recording и Transcript в БД
  5. Сохраняет сегменты со статусом speaker_role="unknown"
  6. Публикует в queue.diarize для определения ролей
  7. Удаляет full_day.wav из MinIO
- `run_transcribe_worker()` — запускает worker, слушает queue.transcribe_full (heartbeat=0)

### worker/diarize_worker.py

Основные функции:
- `process_diarize_message()` — обрабатывает одно сообщение из queue.diarize:
  1. Загружает сегменты из БД
  2. Получает имя продавца из auth.users
  3. Вызывает diarize_segments() для определения ролей (LLM-based, в чанках)
  4. Обновляет speaker_role для каждого сегмента
  5. Обновляет статус транскрипта на "diarized"
  6. Обновляет статус recording в recorder-service
  7. Публикует в queue.analyze для AI анализа
- `run_diarize_worker()` — запускает worker, слушает queue.diarize
