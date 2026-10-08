"""
Приём звонков из телефонии.

Три пути попадания звонка в пайплайн:
1. POST /telephony/calls — ручная загрузка аудио звонка с метаданными (направление,
   номер клиента и т.д.). Авторизация по JWT.
2. POST /telephony/webhook/{token} — вебхук от АТС: JSON с метаданными звонка и
   ссылкой на запись (или base64). Авторизация по секретному токену организации.
3. Прямая загрузка транскрипта — остаётся в transcription-service (/upload-transcript).

Звонок — это уже готовый отдельный разговор, поэтому склейка и сегментация суточного
файла не нужны. Если запись стерео (оператор и клиент в раздельных каналах) — роли
определяются по каналам без LLM-диаризации, и звонок уходит сразу в queue.analyze.
"""
import secrets
import uuid
import logging
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, async_session_maker
from app.deepgram_client import transcribe_audio, transcribe_audio_multichannel
from app.dependencies import get_current_user, require_role
from app.minio_client import upload_bytes, get_minio
from app.models import Recording, TelephonySettings
from app.rabbitmq import publish
from app.wav_utils import detect_wav_channels, file_ext

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/recorder/telephony", tags=["telephony"])

BUCKET = "voiceiq-recordings"

CONTENT_TYPE_MAP = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
}

MAX_AUDIO_BYTES = 500 * 1024 * 1024


def _ensure_bucket():
    client = get_minio()
    if not client.bucket_exists(BUCKET):
        client.make_bucket(BUCKET)


# ─── Настройки телефонии ──────────────────────────────────────────────────────

#: Категории звонков, доступные для настройки «что идёт в рейтинг».
SCORABLE_CATEGORY_CODES = {"sales", "service", "non_target", "other"}


class TelephonySettingsOut(BaseModel):
    is_enabled: bool
    webhook_token: str
    webhook_url_path: str
    default_store_id: Optional[uuid.UUID] = None
    default_seller_id: Optional[uuid.UUID] = None
    operator_channel: int = 0
    operator_mapping: Optional[dict] = None
    # None → используется дефолт (['sales']); список кодов категорий иначе.
    scorable_categories: Optional[list[str]] = None


class TelephonySettingsPatch(BaseModel):
    is_enabled: Optional[bool] = None
    default_store_id: Optional[uuid.UUID] = None
    default_seller_id: Optional[uuid.UUID] = None
    operator_channel: Optional[int] = Field(default=None, ge=0, le=1)
    operator_mapping: Optional[dict] = None
    scorable_categories: Optional[list[str]] = None
    regenerate_token: bool = False


async def _get_or_create_settings(db: AsyncSession, org_id: uuid.UUID) -> TelephonySettings:
    row = (await db.execute(
        select(TelephonySettings).where(TelephonySettings.organization_id == org_id)
    )).scalar_one_or_none()
    if row is None:
        row = TelephonySettings(
            organization_id=org_id,
            webhook_token=secrets.token_hex(24),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _settings_out(s: TelephonySettings) -> TelephonySettingsOut:
    return TelephonySettingsOut(
        is_enabled=s.is_enabled,
        webhook_token=s.webhook_token,
        webhook_url_path=f"/api/v1/recorder/telephony/webhook/{s.webhook_token}",
        default_store_id=s.default_store_id,
        default_seller_id=s.default_seller_id,
        operator_channel=s.operator_channel,
        operator_mapping=s.operator_mapping,
        scorable_categories=s.scorable_categories,
    )


@router.get("/settings", response_model=TelephonySettingsOut)
async def get_telephony_settings(
    user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, uuid.UUID(user["organization_id"]))
    return _settings_out(s)


@router.put("/settings", response_model=TelephonySettingsOut)
async def update_telephony_settings(
    body: TelephonySettingsPatch,
    user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, uuid.UUID(user["organization_id"]))
    if body.is_enabled is not None:
        s.is_enabled = body.is_enabled
    if body.default_store_id is not None:
        s.default_store_id = body.default_store_id
    if body.default_seller_id is not None:
        s.default_seller_id = body.default_seller_id
    if body.operator_channel is not None:
        s.operator_channel = body.operator_channel
    if body.operator_mapping is not None:
        s.operator_mapping = body.operator_mapping
    if body.scorable_categories is not None:
        # Оставляем только валидные коды; пустой список → трактуется как дефолт на стороне анализа
        s.scorable_categories = [c for c in body.scorable_categories if c in SCORABLE_CATEGORY_CODES] or None
    if body.regenerate_token:
        s.webhook_token = secrets.token_hex(24)
    await db.commit()
    await db.refresh(s)
    return _settings_out(s)


# ─── Ручная загрузка звонка ───────────────────────────────────────────────────

@router.post("/calls")
async def upload_call(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    seller_id: str = Form(...),
    store_id: str = Form(...),
    direction: str = Form("inbound"),  # inbound | outbound
    client_phone: str = Form(""),
    operator_phone: str = Form(""),
    session_date: str = Form(""),  # YYYY-MM-DD, пусто = сегодня
    started_at: str = Form(""),    # ISO datetime, пусто = сейчас
    channel_mode: str = Form("auto"),  # auto | stereo | mono
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ручная загрузка записи звонка с метаданными телефонии."""
    org_id = current_user["organization_id"]

    ext = file_ext(file.filename)
    if ext not in CONTENT_TYPE_MAP:
        raise HTTPException(400, "Supported formats: WAV, MP3, OGG")
    if direction not in ("inbound", "outbound"):
        raise HTTPException(400, "direction must be 'inbound' or 'outbound'")
    if channel_mode not in ("auto", "stereo", "mono"):
        raise HTTPException(400, "channel_mode must be 'auto', 'stereo' or 'mono'")

    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "File too large (max 500 MB)")
    if not audio_bytes:
        raise HTTPException(400, "Empty file")

    try:
        sess_date = date.fromisoformat(session_date) if session_date else date.today()
    except ValueError:
        raise HTTPException(400, "Invalid session_date format (YYYY-MM-DD)")
    try:
        started = datetime.fromisoformat(started_at) if started_at else datetime.now(timezone.utc)
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Invalid started_at format (ISO datetime)")

    tel_settings = await _get_or_create_settings(db, uuid.UUID(org_id))

    recording_id = await _create_call_recording(
        db,
        org_id=org_id,
        store_id=store_id,
        seller_id=seller_id,
        session_date=sess_date,
        started_at=started,
        audio_bytes=audio_bytes,
        ext=ext,
        source="call_manual",
        direction=direction,
        client_phone=client_phone.strip() or None,
        operator_phone=operator_phone.strip() or None,
        external_call_id=None,
        call_metadata=None,
    )

    background_tasks.add_task(
        _process_call_audio,
        recording_id=recording_id,
        audio_bytes=audio_bytes,
        ext=ext,
        org_id=org_id,
        store_id=store_id,
        seller_id=seller_id,
        channel_mode=channel_mode,
        operator_channel=tel_settings.operator_channel,
        direction=direction,
        client_phone=client_phone.strip() or None,
    )

    return {
        "recording_id": str(recording_id),
        "status": "processing",
        "message": "Звонок загружен, транскрибация запущена",
    }


# ─── Вебхук от АТС ────────────────────────────────────────────────────────────

class WebhookCallPayload(BaseModel):
    """Универсальный формат вебхука. Минимум: recording_url. Остальное опционально."""
    external_call_id: Optional[str] = None
    direction: str = "inbound"                     # inbound | outbound
    client_phone: Optional[str] = None
    operator_phone: Optional[str] = None           # добавочный/номер оператора
    recording_url: str                             # прямая ссылка на аудиофайл
    started_at: Optional[datetime] = None
    store_id: Optional[uuid.UUID] = None           # если АТС знает, иначе default из настроек
    seller_id: Optional[uuid.UUID] = None          # если известен, иначе маппинг/default
    channel_mode: str = "auto"                     # auto | stereo | mono
    metadata: Optional[dict] = None                # очередь, время ожидания и пр. — сохраняется как есть


@router.post("/webhook/{token}")
async def telephony_webhook(
    token: str,
    body: WebhookCallPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Приём звонка от АТС. Аутентификация по токену организации из URL.

    Возвращает 200 с duplicate=true для повторных вебхуков по тому же
    external_call_id — чтобы АТС не зацикливала ретраи.
    """
    tel = (await db.execute(
        select(TelephonySettings).where(TelephonySettings.webhook_token == token)
    )).scalar_one_or_none()
    if tel is None:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    if not tel.is_enabled:
        raise HTTPException(status_code=403, detail="Telephony intake is disabled")

    org_id = tel.organization_id

    if body.direction not in ("inbound", "outbound"):
        raise HTTPException(400, "direction must be 'inbound' or 'outbound'")

    # Дедупликация по external_call_id
    if body.external_call_id:
        existing = (await db.execute(
            select(Recording.id).where(
                Recording.organization_id == org_id,
                Recording.external_call_id == body.external_call_id,
            )
        )).scalar_one_or_none()
        if existing:
            return {"recording_id": str(existing), "duplicate": True}

    # Определяем оператора: явный seller_id → маппинг по добавочному → дефолт
    seller_id = body.seller_id
    if seller_id is None and body.operator_phone and tel.operator_mapping:
        mapped = tel.operator_mapping.get(body.operator_phone.strip())
        if mapped:
            try:
                seller_id = uuid.UUID(str(mapped))
            except ValueError:
                logger.warning("Bad seller uuid in operator_mapping: %r", mapped)
    if seller_id is None:
        seller_id = tel.default_seller_id
    store_id = body.store_id or tel.default_store_id

    if seller_id is None or store_id is None:
        raise HTTPException(
            status_code=422,
            detail="Cannot resolve seller/store: set default_store_id and default_seller_id "
                   "in telephony settings or pass them in the webhook",
        )

    # Скачиваем запись
    audio_bytes, ext = await _download_recording(body.recording_url)

    started = body.started_at or datetime.now(timezone.utc)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    recording_id = await _create_call_recording(
        db,
        org_id=str(org_id),
        store_id=str(store_id),
        seller_id=str(seller_id),
        session_date=started.date(),
        started_at=started,
        audio_bytes=audio_bytes,
        ext=ext,
        source="call_webhook",
        direction=body.direction,
        client_phone=(body.client_phone or "").strip() or None,
        operator_phone=(body.operator_phone or "").strip() or None,
        external_call_id=(body.external_call_id or "").strip() or None,
        call_metadata=body.metadata,
    )

    background_tasks.add_task(
        _process_call_audio,
        recording_id=recording_id,
        audio_bytes=audio_bytes,
        ext=ext,
        org_id=str(org_id),
        store_id=str(store_id),
        seller_id=str(seller_id),
        channel_mode=body.channel_mode if body.channel_mode in ("auto", "stereo", "mono") else "auto",
        operator_channel=tel.operator_channel,
        direction=body.direction,
        client_phone=(body.client_phone or "").strip() or None,
    )

    return {"recording_id": str(recording_id), "status": "processing"}


async def _download_recording(url: str) -> tuple[bytes, str]:
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "recording_url must be an http(s) URL")
    try:
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            audio_bytes = resp.content
    except httpx.HTTPError as e:
        raise HTTPException(status_code=422, detail=f"Failed to download recording: {e}")

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "Recording too large (max 500 MB)")
    if not audio_bytes:
        raise HTTPException(422, "Downloaded recording is empty")

    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    ext = {
        "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/ogg": ".ogg", "application/ogg": ".ogg",
    }.get(content_type) or file_ext(url.split("?")[0]) or ".wav"
    if ext not in CONTENT_TYPE_MAP:
        ext = ".wav"
    return audio_bytes, ext


# ─── Общая обработка ──────────────────────────────────────────────────────────

async def _create_call_recording(
    db: AsyncSession,
    *,
    org_id: str,
    store_id: str,
    seller_id: str,
    session_date: date,
    started_at: datetime,
    audio_bytes: bytes,
    ext: str,
    source: str,
    direction: str,
    client_phone: str | None,
    operator_phone: str | None,
    external_call_id: str | None,
    call_metadata: dict | None,
) -> uuid.UUID:
    recording_id = uuid.uuid4()
    _ensure_bucket()
    object_path = f"{org_id}/{store_id}/{seller_id}/{session_date}/{recording_id}{ext}"
    upload_bytes(BUCKET, object_path, audio_bytes, content_type=CONTENT_TYPE_MAP.get(ext, "audio/wav"))

    recording = Recording(
        id=recording_id,
        organization_id=uuid.UUID(org_id),
        store_id=uuid.UUID(store_id),
        seller_id=uuid.UUID(seller_id),
        device_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        session_date=session_date,
        started_at=started_at,
        audio_path=f"{BUCKET}/{object_path}",
        file_size_bytes=len(audio_bytes),
        status="processing",
        source=source,
        call_direction=direction,
        client_phone=client_phone,
        operator_phone=operator_phone,
        external_call_id=external_call_id,
        call_metadata=call_metadata,
    )
    db.add(recording)
    await db.commit()
    return recording_id


async def _process_call_audio(
    recording_id: uuid.UUID,
    audio_bytes: bytes,
    ext: str,
    org_id: str,
    store_id: str,
    seller_id: str,
    channel_mode: str,
    operator_channel: int,
    direction: str,
    client_phone: str | None,
):
    """Фоновая обработка звонка: STT → сохранение транскрипта → очередь.

    Стерео (каналы раздельные) → роли по каналам, сразу queue.analyze.
    Моно → обычный путь: queue.diarize (кластерная/LLM диаризация).
    """
    try:
        use_multichannel = False
        if channel_mode == "stereo":
            use_multichannel = True
        elif channel_mode == "auto" and ext == ".wav":
            use_multichannel = (detect_wav_channels(audio_bytes) or 1) >= 2

        whisper_result = None
        roles_assigned = False
        if use_multichannel:
            try:
                mc = await transcribe_audio_multichannel(audio_bytes, operator_channel)
                if not mc.get("multichannel_failed") and mc.get("segments"):
                    whisper_result = mc
                    roles_assigned = True
                else:
                    logger.info(
                        "Multichannel transcription not usable for %s, falling back to mono path",
                        recording_id,
                    )
            except Exception as e:
                logger.warning("Multichannel transcription failed for %s: %s", recording_id, e)

        if whisper_result is None:
            whisper_result = await transcribe_audio(audio_bytes, f"audio{ext}")

        segments_raw = whisper_result.get("segments", [])
        full_text = whisper_result.get("text", "")
        if not segments_raw and full_text:
            segments_raw = [{"start": 0, "end": 0, "text": full_text, "speaker": None}]
        if not segments_raw:
            logger.error("Empty transcription for call %s", recording_id)
            await _set_status(recording_id, "failed", "Пустая транскрибация")
            return

        duration_seconds = int(max(s.get("end", 0) for s in segments_raw))
        transcript_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        async with async_session_maker() as db:
            await db.execute(text("""
                INSERT INTO transcription.transcripts
                    (id, recording_id, organization_id, store_id, seller_id,
                     full_text, language, duration_seconds, status, whisper_model, created_at)
                VALUES
                    (:id, :rec_id, :org_id, :store_id, :seller_id,
                     :full_text, 'ru', :duration, :status, 'deepgram-whisper', :now)
            """), {
                "id": transcript_id,
                "rec_id": recording_id,
                "org_id": uuid.UUID(org_id),
                "store_id": uuid.UUID(store_id),
                "seller_id": uuid.UUID(seller_id),
                "full_text": full_text or " ".join(s["text"] for s in segments_raw),
                "duration": duration_seconds,
                "status": "diarized" if roles_assigned else "transcribed",
                "now": now,
            })

            for idx, seg in enumerate(segments_raw):
                await db.execute(text("""
                    INSERT INTO transcription.transcript_segments
                        (id, transcript_id, speaker_role, speaker_id, text, start_ms, end_ms, segment_index)
                    VALUES
                        (:id, :t_id, :role, :speaker_id, :text, :start_ms, :end_ms, :idx)
                """), {
                    "id": uuid.uuid4(),
                    "t_id": transcript_id,
                    "role": seg.get("role") or "unknown",
                    "speaker_id": seg.get("speaker"),
                    "text": seg["text"],
                    "start_ms": int(seg.get("start", 0) * 1000),
                    "end_ms": int(seg.get("end", 0) * 1000),
                    "idx": idx,
                })

            await db.execute(text("""
                UPDATE recorder.recordings
                SET status = 'transcribed', duration_seconds = :dur, updated_at = :now
                WHERE id = :id
            """), {"dur": duration_seconds, "now": now, "id": recording_id})
            await db.commit()

        payload = {
            "recording_id": str(recording_id),
            "transcript_id": str(transcript_id),
            "seller_id": seller_id,
            "store_id": store_id,
            "organization_id": org_id,
        }
        if roles_assigned:
            # Роли уже известны из каналов — LLM-диаризация не нужна
            await publish("queue.analyze", payload)
            logger.info("Call %s: channel diarization OK, published to queue.analyze", recording_id)
        else:
            await publish("queue.diarize", payload)
            logger.info("Call %s: mono path, published to queue.diarize", recording_id)

    except Exception as e:
        logger.error("Call processing failed for %s: %s", recording_id, e, exc_info=True)
        await _set_status(recording_id, "failed", str(e)[:500])


async def _set_status(recording_id: uuid.UUID, status: str, error: str | None = None):
    try:
        async with async_session_maker() as db:
            await db.execute(text("""
                UPDATE recorder.recordings
                SET status = :status, error_message = :err, updated_at = :now
                WHERE id = :id
            """), {
                "status": status,
                "err": error,
                "now": datetime.now(timezone.utc),
                "id": recording_id,
            })
            await db.commit()
    except Exception as e:
        logger.error("Could not update recording status: %s", e)
