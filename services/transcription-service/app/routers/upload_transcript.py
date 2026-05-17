"""Endpoint для загрузки заранее размеченного транскрипта.

Используется для тестирования аналитического пайплайна (скоринг, возражения,
апсейл/кросс-сейл) без реальной аудиозаписи. Принимает диалог с разметкой по
ролям (seller/customer), создаёт Recording/Transcript/TranscriptSegments и
публикует сообщение в queue.analyze.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Transcript, TranscriptSegment
from app.rabbitmq import publish

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/transcription", tags=["upload-transcript"])


SpeakerRole = Literal["seller", "customer"]


class TranscriptSegmentInput(BaseModel):
    speaker_role: SpeakerRole
    text: str = Field(min_length=1)
    start_ms: int | None = None
    end_ms: int | None = None


class UploadTranscriptRequest(BaseModel):
    store_id: uuid.UUID
    seller_id: uuid.UUID
    session_date: date | None = None
    # Один из двух способов передать диалог:
    segments: list[TranscriptSegmentInput] | None = None
    raw_text: str | None = None


# Префиксы ролей в свободном тексте. "продавец/менеджер/консультант" → seller,
# "клиент/покупатель" → customer.
_SELLER_LABELS = {"продавец", "продавца", "менеджер", "консультант", "оператор", "seller", "s"}
_CLIENT_LABELS = {"клиент", "покупатель", "customer", "client", "c"}


def _parse_raw_text(raw: str) -> list[TranscriptSegmentInput]:
    """Парсит диалог формата "Роль: текст" в список сегментов.

    Многострочный текст одной реплики поддерживается — продолжение склеивается,
    пока не встретится новый префикс роли в начале строки.
    """
    out: list[TranscriptSegmentInput] = []
    current_role: SpeakerRole | None = None
    current_chunks: list[str] = []

    def flush():
        if current_role and current_chunks:
            text = " ".join(c.strip() for c in current_chunks if c.strip()).strip()
            if text:
                out.append(TranscriptSegmentInput(speaker_role=current_role, text=text))

    role_re = re.compile(r"^\s*([A-Za-zА-Яа-яЁё]+)\s*[:\-—–]\s*(.*)$")
    for line in raw.splitlines():
        m = role_re.match(line)
        if m:
            label = m.group(1).lower()
            rest = m.group(2)
            role: SpeakerRole | None = None
            if label in _SELLER_LABELS:
                role = "seller"
            elif label in _CLIENT_LABELS:
                role = "customer"
            if role is not None:
                flush()
                current_role = role
                current_chunks = [rest] if rest else []
                continue
        # продолжение текущей реплики
        if current_role is not None:
            current_chunks.append(line)
    flush()
    return out


@router.post("/upload-transcript", status_code=201)
async def upload_transcript(
    body: UploadTranscriptRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Принимает готовый размеченный транскрипт и запускает аналитический пайплайн.

    Создаёт recording-пустышку (без аудио-файла), Transcript со статусом 'diarized',
    TranscriptSegment'ы с проставленными ролями и публикует в queue.analyze.
    """
    if user.get("role") == "service":
        raise HTTPException(status_code=403, detail="Use authenticated user, not service key")

    org_id_str = user.get("organization_id")
    if not org_id_str:
        raise HTTPException(status_code=403, detail="No organization in token")
    try:
        org_id = uuid.UUID(org_id_str)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Invalid organization_id in token")

    # 1) Получаем сегменты — либо явный список, либо парсим raw_text
    if body.segments:
        segments = body.segments
    elif body.raw_text:
        segments = _parse_raw_text(body.raw_text)
    else:
        raise HTTPException(status_code=422, detail="Provide either 'segments' or 'raw_text'")

    if not segments:
        raise HTTPException(status_code=422, detail="No valid segments parsed")

    # 2) Проставляем тайминги если не пришли — 4 секунды на сегмент (среднее для оценки)
    DEFAULT_SEG_MS = 4000
    cursor_ms = 0
    normalized: list[dict] = []
    for i, seg in enumerate(segments):
        start_ms = seg.start_ms if seg.start_ms is not None else cursor_ms
        end_ms = seg.end_ms if seg.end_ms is not None else start_ms + DEFAULT_SEG_MS
        if end_ms <= start_ms:
            end_ms = start_ms + DEFAULT_SEG_MS
        normalized.append({
            "speaker_role": seg.speaker_role,
            "text": seg.text.strip(),
            "start_ms": start_ms,
            "end_ms": end_ms,
            "segment_index": i,
        })
        cursor_ms = end_ms

    duration_seconds = (normalized[-1]["end_ms"] + 999) // 1000
    session_date_val = body.session_date or date.today()

    # 3) Создаём Recording-пустышку через recorder-service
    recording_id = uuid.uuid4()
    device_id = uuid.uuid4()  # фейковый device — у загрузки нет реального устройства
    started_at = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=10.0) as http:
        rec_resp = await http.post(
            f"{settings.RECORDER_SERVICE_URL}/api/v1/recorder/recordings/internal",
            json={
                "id": str(recording_id),
                "organization_id": str(org_id),
                "store_id": str(body.store_id),
                "seller_id": str(body.seller_id),
                "device_id": str(device_id),
                "session_date": session_date_val.isoformat(),
                "started_at": started_at.isoformat(),
                "duration_seconds": duration_seconds,
                "audio_path": f"transcript-only/{recording_id}",  # placeholder, аудио нет
                "file_size_bytes": 0,
                "status": "transcribed",
            },
        )
        if rec_resp.status_code >= 400:
            logger.error("recorder-service refused recording: %d %s", rec_resp.status_code, rec_resp.text)
            raise HTTPException(status_code=502, detail=f"recorder-service error: {rec_resp.text}")

    # 4) Создаём Transcript + сегменты со статусом 'diarized' (роли уже размечены)
    full_text = "\n".join(s["text"] for s in normalized)
    transcript = Transcript(
        id=uuid.uuid4(),
        recording_id=recording_id,
        organization_id=org_id,
        store_id=body.store_id,
        seller_id=body.seller_id,
        full_text=full_text,
        language="ru",
        duration_seconds=duration_seconds,
        status="diarized",
        whisper_model="manual-upload",
    )
    db.add(transcript)
    await db.flush()

    for seg in normalized:
        db.add(TranscriptSegment(
            transcript_id=transcript.id,
            speaker_role=seg["speaker_role"],
            speaker_id=None,
            text=seg["text"],
            start_ms=seg["start_ms"],
            end_ms=seg["end_ms"],
            segment_index=seg["segment_index"],
            avg_logprob=None,
        ))

    await db.commit()

    # 5) Сразу публикуем в queue.analyze — диаризация уже не нужна
    await publish("queue.analyze", {
        "recording_id": str(recording_id),
        "transcript_id": str(transcript.id),
        "seller_id": str(body.seller_id),
        "store_id": str(body.store_id),
        "organization_id": str(org_id),
    })

    logger.info(
        "Manual transcript uploaded: recording_id=%s transcript_id=%s segments=%d duration=%ds",
        recording_id, transcript.id, len(normalized), duration_seconds,
    )

    return {
        "recording_id": str(recording_id),
        "transcript_id": str(transcript.id),
        "segments_count": len(normalized),
        "duration_seconds": duration_seconds,
    }
