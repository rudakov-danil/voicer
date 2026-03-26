# Recorder Service (Сервис записи)

## Описание сервиса

Recorder Service получает аудиочанки с аудиобейджей (устройств), хранит их в MinIO, управляет сессиями записи и координирует склеивание (stitching) аудиофайлов из отдельных чанков в полный файл дня. Сервис работает с очередью RabbitMQ для асинхронной обработки.

## Принципы работы

### Архитектура

1. **Получение чанков**: Бейджи отправляют аудиочанки через HTTP POST
2. **Хранение**: Чанки сохраняются в MinIO (bucket voiceiq-audio-chunks)
3. **Склеивание**: Стоит в очереди queue.stitch worker, который склеивает чанки одного дня в один WAV
4. **Передача**: После склеивания отправляется в queue.transcribe_full для транскрипции
5. **Контроль доступа**: Бейджи аутентифицируются по device_id, проверяется статус устройства

### Основная логика

- Бейджи отправляют чанки неупорядоченно, сервис сортирует по chunk_index
- После каждого 10-го чанка (или первого) срабатывает задача stitching
- На finalize срабатывает финальное stitching
- После stitching создаётся объект Recording в БД со статусом segmented

## Входные и выходные данные

### REST API Endpoints

**Chunks** (`/api/v1/recorder`):
- `POST /chunks` — загрузка аудиочанка (WAV, форма данных)
  - Параметры: file, device_id, chunk_index, session_date, timestamp_start, timestamp_end
  - Возвращает: {chunk_id, status}
- `POST /chunks/finalize` — завершение сессии (форма данных)
  - Параметры: device_id, session_date, total_chunks
  - Возвращает: {status}

**Recordings** (`/api/v1/recorder`):
- `GET /recordings` — список записей пользователя с фильтрацией
- `GET /recordings/{recording_id}/audio` — presigned URL для скачивания WAV
- `POST /recordings/internal` — создание записи (вызывается transcription-service)
- `PATCH /recordings/{recording_id}/status` — обновление статуса (вызывается transcription-service)

### RabbitMQ очереди

**На выход**:
- `queue.stitch` — задачи по склеиванию чанков
  - Payload: {device_id, session_date, organization_id, store_id, seller_id, finalize?, total_chunks?}
- `queue.transcribe_full` — полный файл готов к транскрипции
  - Payload: {device_id, seller_id, store_id, organization_id, audio_path, session_date}

### MinIO Buckets

- `voiceiq-audio-chunks` — отдельные чанки с паттерном `org_id/device_id/date/index_uuid.wav`
- `voiceiq-audio-full` — полные файлы дня с паттерном `org_id/device_id/date/full_day.wav`
- `voiceiq-recordings` — финальные записи для скачивания

### База данных (PostgreSQL schema: recorder)

**Таблица `recordings`**:
- id (UUID primary key)
- organization_id, store_id, seller_id, device_id (UUID)
- session_date (date)
- started_at, ended_at (datetime)
- duration_seconds (optional int)
- audio_path (string)
- file_size_bytes (optional bigint)
- status (string): pending, stitching, ready, segmented, transcribing, transcribed, failed
- error_message (optional text)
- created_at, updated_at (datetime)

**Таблица `audio_chunks`**:
- id (UUID primary key)
- organization_id, device_id (UUID)
- session_date (date)
- chunk_index (int)
- duration_ms (int)
- audio_path (string)
- timestamp_start, timestamp_end (datetime)
- received_at (datetime)
- stitched (boolean)

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
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
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


def require_role(*roles: str):
    async def _check(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check
```

### app/device_auth.py

```python
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AudioChunk


class DeviceRecord:
    def __init__(self, id, organization_id, store_id, seller_id, serial_number, is_active):
        self.id = id
        self.organization_id = organization_id
        self.store_id = store_id
        self.seller_id = seller_id
        self.serial_number = serial_number
        self.is_active = is_active


import httpx
from app.config import settings


async def verify_device(device_id: str) -> DeviceRecord | None:
    """
    Проверяет device_id через admin-service.
    Возвращает DeviceRecord если устройство найдено и активно, иначе None.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.ADMIN_SERVICE_URL}/api/v1/admin/devices/by-serial/{device_id}",
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data.get("is_active", False):
            return None
        return DeviceRecord(
            id=UUID(data["id"]),
            organization_id=UUID(data["organization_id"]),
            store_id=UUID(data["store_id"]),
            seller_id=UUID(data["seller_id"]) if data.get("seller_id") else None,
            serial_number=data["serial_number"],
            is_active=data["is_active"],
        )
    except Exception:
        return None
```

### app/main.py

```python
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
```

### app/models.py

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Date, Integer, BigInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Recording(Base):
    __tablename__ = "recordings"
    __table_args__ = {"schema": "recorder"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), nullable=False)
    seller_id = Column(UUID(as_uuid=True), nullable=False)
    device_id = Column(UUID(as_uuid=True), nullable=False)
    session_date = Column(Date, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    audio_path = Column(String(500), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=True)
    status = Column(String(30), nullable=False, default="pending")
    # pending | stitching | ready | segmented | transcribing | transcribed | failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class AudioChunk(Base):
    __tablename__ = "audio_chunks"
    __table_args__ = {"schema": "recorder"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    device_id = Column(UUID(as_uuid=True), nullable=False)
    session_date = Column(Date, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    duration_ms = Column(Integer, nullable=False)
    audio_path = Column(String(500), nullable=False)
    timestamp_start = Column(DateTime(timezone=True), nullable=False)
    timestamp_end = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    stitched = Column(Boolean, nullable=False, default=False)
```

### app/schemas.py

```python
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ChunkUploadResponse(BaseModel):
    chunk_id: UUID
    status: str


class FinalizeResponse(BaseModel):
    status: str


class RecordingResponse(BaseModel):
    id: UUID
    seller_id: UUID
    seller_name: Optional[str] = None
    store_id: UUID
    store_name: Optional[str] = None
    session_date: date
    started_at: datetime
    duration_seconds: Optional[int]
    status: str

    class Config:
        from_attributes = True


class RecordingListResponse(BaseModel):
    items: list[RecordingResponse]
    total: int


class AudioUrlResponse(BaseModel):
    url: str
    expires_in: int


class DeviceRecord(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    seller_id: Optional[UUID]
    serial_number: str
    is_active: bool
```

### app/audio.py

```python
import io
from pydub import AudioSegment


def stitch_chunks(chunks: list[bytes]) -> bytes:
    """
    Склеивает список WAV-чанков в один файл.
    chunks должны быть отсортированы по chunk_index до передачи.
    Возвращает WAV-байты результирующего файла.
    """
    if not chunks:
        raise ValueError("No chunks to stitch")

    result = AudioSegment.empty()
    for chunk_data in chunks:
        segment = AudioSegment.from_wav(io.BytesIO(chunk_data))
        result += segment

    buf = io.BytesIO()
    result.export(buf, format="wav")
    return buf.getvalue()


def get_duration_ms(wav_bytes: bytes) -> int:
    """Возвращает длительность WAV-файла в миллисекундах."""
    segment = AudioSegment.from_wav(io.BytesIO(wav_bytes))
    return len(segment)
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


def upload_bytes(bucket: str, object_name: str, data: bytes, content_type: str = "audio/wav") -> None:
    client = get_minio()
    client.put_object(
        bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def download_bytes(bucket: str, object_name: str) -> bytes:
    client = get_minio()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(bucket: str, object_name: str) -> None:
    client = get_minio()
    client.remove_object(bucket, object_name)


def get_presigned_url(bucket: str, object_name: str, expires_seconds: int = 3600) -> str:
    from datetime import timedelta
    client = get_minio()
    return client.presigned_get_object(bucket, object_name, expires=timedelta(seconds=expires_seconds))
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

### app/routers/chunks.py

```python
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.device_auth import verify_device
from app.minio_client import upload_bytes
from app.models import AudioChunk
from app.rabbitmq import publish
from app.schemas import ChunkUploadResponse, FinalizeResponse

router = APIRouter(prefix="/api/v1/recorder", tags=["chunks"])

AUDIO_CHUNKS_BUCKET = "voiceiq-audio-chunks"


@router.post("/chunks", response_model=ChunkUploadResponse, status_code=201)
async def upload_chunk(
    file: UploadFile = File(...),
    device_id: str = Form(...),
    chunk_index: int = Form(...),
    session_date: str = Form(...),
    timestamp_start: str = Form(...),
    timestamp_end: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    # Validate audio format
    if file.content_type not in ("audio/wav", "audio/wave", "audio/x-wav"):
        if not (file.filename or "").lower().endswith(".wav"):
            raise HTTPException(status_code=400, detail="Only WAV format is accepted")

    # Verify device
    device = await verify_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="Device is inactive")

    # Parse dates
    try:
        session_date_obj = date.fromisoformat(session_date)
        ts_start = datetime.fromisoformat(timestamp_start.replace("Z", "+00:00"))
        ts_end = datetime.fromisoformat(timestamp_end.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")

    # Read audio data
    audio_data = await file.read()
    duration_ms = int((ts_end - ts_start).total_seconds() * 1000)

    # Save to MinIO
    chunk_id = uuid.uuid4()
    object_name = (
        f"{device.organization_id}/{device.id}/{session_date}/{chunk_index:06d}_{chunk_id}.wav"
    )
    upload_bytes(AUDIO_CHUNKS_BUCKET, object_name, audio_data)

    # Save to DB
    chunk = AudioChunk(
        id=chunk_id,
        organization_id=device.organization_id,
        device_id=device.id,
        session_date=session_date_obj,
        chunk_index=chunk_index,
        duration_ms=duration_ms,
        audio_path=f"{AUDIO_CHUNKS_BUCKET}/{object_name}",
        timestamp_start=ts_start,
        timestamp_end=ts_end,
    )
    db.add(chunk)
    await db.commit()

    # Publish stitch task every 10 chunks or on first chunk
    if chunk_index % 10 == 0 or chunk_index == 0:
        await publish("queue.stitch", {
            "device_id": str(device.id),
            "session_date": session_date,
            "organization_id": str(device.organization_id),
            "store_id": str(device.store_id),
            "seller_id": str(device.seller_id) if device.seller_id else None,
        })

    return ChunkUploadResponse(chunk_id=chunk_id, status="received")


@router.post("/chunks/finalize", response_model=FinalizeResponse)
async def finalize_session(
    device_id: str = Form(...),
    session_date: str = Form(...),
    total_chunks: int = Form(...),
):
    device = await verify_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    await publish("queue.stitch", {
        "device_id": str(device.id),
        "session_date": session_date,
        "organization_id": str(device.organization_id),
        "store_id": str(device.store_id),
        "seller_id": str(device.seller_id) if device.seller_id else None,
        "finalize": True,
        "total_chunks": total_chunks,
    })

    return FinalizeResponse(status="finalize_scheduled")
```

### app/routers/recordings.py

```python
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.minio_client import get_presigned_url
from app.models import Recording
from app.schemas import AudioUrlResponse, RecordingListResponse, RecordingResponse

router = APIRouter(prefix="/api/v1/recorder", tags=["recordings"])


def _apply_access(q, user: dict):
    q = q.where(Recording.organization_id == user["organization_id"])
    role = user["role"]
    if role == "rop":
        q = q.where(Recording.store_id.in_(user.get("rop_stores", [])))
    elif role == "manager":
        q = q.where(Recording.store_id == user["store_id"])
    return q


@router.get("/recordings", response_model=RecordingListResponse)
async def list_recordings(
    store_id: Optional[UUID] = Query(default=None),
    seller_id: Optional[UUID] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Recording)
    q = _apply_access(q, current_user)

    if store_id:
        q = q.where(Recording.store_id == store_id)
    if seller_id:
        q = q.where(Recording.seller_id == seller_id)
    if date_from:
        q = q.where(Recording.session_date >= date_from)
    if date_to:
        q = q.where(Recording.session_date <= date_to)
    if status:
        q = q.where(Recording.status == status)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    recordings = (await db.execute(q.order_by(Recording.started_at.desc()).limit(limit).offset(offset))).scalars().all()

    return {
        "items": [RecordingResponse.model_validate(r) for r in recordings],
        "total": total,
    }


@router.get("/recordings/{recording_id}/audio", response_model=AudioUrlResponse)
async def get_audio_url(
    recording_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Recording).where(Recording.id == recording_id)
    q = _apply_access(q, current_user)
    recording = (await db.execute(q)).scalar_one_or_none()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # audio_path format: "voiceiq-recordings/org_id/store_id/seller_id/date/uuid.wav"
    # Split bucket from object path
    parts = recording.audio_path.split("/", 1)
    bucket = parts[0]
    object_name = parts[1]

    url = get_presigned_url(bucket, object_name, expires_seconds=3600)
    return AudioUrlResponse(url=url, expires_in=3600)


class InternalRecordingCreate(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    seller_id: Optional[UUID] = None
    device_id: UUID
    session_date: date
    started_at: datetime
    duration_seconds: Optional[int] = None
    audio_path: str
    file_size_bytes: Optional[int] = None
    status: str = "segmented"


@router.post("/recordings/internal", status_code=201)
async def create_recording_internal(
    data: InternalRecordingCreate,
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint — called by transcription-worker to create a recording after segmentation."""
    recording = Recording(
        id=data.id,
        organization_id=data.organization_id,
        store_id=data.store_id,
        seller_id=data.seller_id,
        device_id=data.device_id,
        session_date=data.session_date,
        started_at=data.started_at,
        duration_seconds=data.duration_seconds,
        audio_path=data.audio_path,
        file_size_bytes=data.file_size_bytes,
        status=data.status,
    )
    db.add(recording)
    await db.commit()
    return {"id": str(data.id), "status": data.status}


@router.patch("/recordings/{recording_id}/status")
async def update_recording_status(
    recording_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint — called by transcription-service to update status."""
    recording = (await db.execute(
        select(Recording).where(Recording.id == recording_id)
    )).scalar_one_or_none()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording.status = status
    await db.commit()
    return {"id": str(recording_id), "status": status}
```

### worker/stitch_worker.py

```python
import asyncio
import json
import logging
import uuid
from datetime import date, datetime, timezone

import aio_pika
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.audio import stitch_chunks, get_duration_ms
from app.config import settings
from app.minio_client import upload_bytes, download_bytes
from app.models import AudioChunk, Recording

logger = logging.getLogger(__name__)

AUDIO_CHUNKS_BUCKET = "voiceiq-audio-chunks"
AUDIO_FULL_BUCKET = "voiceiq-audio-full"
RECORDINGS_BUCKET = "voiceiq-recordings"


async def process_stitch_message(
    message: aio_pika.IncomingMessage,
    session_maker,
) -> None:
    async with message.process(requeue=False):
        try:
            payload = json.loads(message.body)
            device_id = payload["device_id"]
            session_date = payload["session_date"]
            session_date_obj = date.fromisoformat(session_date)
            organization_id = payload["organization_id"]
            store_id = payload["store_id"]
            seller_id = payload.get("seller_id")

            async with session_maker() as db:
                # Get all unstitched chunks for this device+date, sorted by index
                result = await db.execute(
                    select(AudioChunk)
                    .where(
                        AudioChunk.device_id == device_id,
                        AudioChunk.session_date == session_date_obj,
                        AudioChunk.stitched == False,
                    )
                    .order_by(AudioChunk.chunk_index)
                )
                chunks = result.scalars().all()

                if not chunks:
                    logger.info(f"No unstitched chunks for device={device_id} date={session_date}")
                    return

                # Download chunk audio from MinIO
                chunk_data_list = []
                for chunk in chunks:
                    # audio_path format: "bucket/object_name"
                    parts = chunk.audio_path.split("/", 1)
                    bucket = parts[0]
                    obj = parts[1]
                    data = download_bytes(bucket, obj)
                    chunk_data_list.append(data)

                # Stitch
                full_audio = stitch_chunks(chunk_data_list)
                duration_ms = get_duration_ms(full_audio)

                # Save full_day.wav to MinIO
                full_object_name = f"{organization_id}/{device_id}/{session_date}/full_day.wav"
                upload_bytes(AUDIO_FULL_BUCKET, full_object_name, full_audio)

                # Mark chunks as stitched
                chunk_ids = [c.id for c in chunks]
                await db.execute(
                    update(AudioChunk)
                    .where(AudioChunk.id.in_(chunk_ids))
                    .values(stitched=True)
                )
                await db.commit()

            # Publish to queue.transcribe_full
            from app.rabbitmq import publish
            audio_path = f"{AUDIO_FULL_BUCKET}/{full_object_name}"
            await publish("queue.transcribe_full", {
                "device_id": device_id,
                "seller_id": seller_id,
                "store_id": store_id,
                "organization_id": organization_id,
                "audio_path": audio_path,
                "session_date": session_date,
            })

            logger.info(f"Stitched {len(chunks)} chunks for device={device_id} date={session_date}")

        except Exception as e:
            logger.error(f"Stitch worker error: {e}", exc_info=True)
            raise


async def run_stitch_worker(session_maker) -> None:
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)

    queue = await channel.declare_queue("queue.stitch", durable=True)

    async def on_message(message: aio_pika.IncomingMessage):
        await process_stitch_message(message, session_maker)

    await queue.consume(on_message)
    logger.info("Stitch worker started, consuming queue.stitch")
    await asyncio.Future()


if __name__ == "__main__":
    from app.database import async_session_maker
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_stitch_worker(async_session_maker))
```
