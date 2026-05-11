"""
Manual audio upload → local Whisper transcription → diarize queue.

Accepts a single audio file with seller_id and session_date,
saves it to MinIO, calls local Whisper server for transcription,
stores transcript in the transcription schema, then publishes
to queue.diarize for Qwen role assignment.
"""
import uuid
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, async_session_maker
from app.deepgram_client import transcribe_audio
from app.dependencies import get_current_user
from app.minio_client import upload_bytes, get_minio
from app.rabbitmq import publish

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/recorder", tags=["upload"])

BUCKET = "voiceiq-recordings"

CONTENT_TYPE_MAP = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
}


def _ensure_bucket():
    client = get_minio()
    if not client.bucket_exists(BUCKET):
        client.make_bucket(BUCKET)


@router.post("/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    seller_id: str = Form(...),
    store_id: str = Form(...),
    session_date: str = Form(...),  # YYYY-MM-DD
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a single audio file for transcription and analysis."""
    org_id = current_user["organization_id"]

    # Validate file
    ext = ""
    if file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in (".wav", ".mp3", ".ogg"):
        raise HTTPException(400, "Supported formats: WAV, MP3, OGG")

    audio_bytes = await file.read()
    if len(audio_bytes) > 500 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 500 MB)")

    # Parse date
    try:
        sess_date = date.fromisoformat(session_date)
    except ValueError:
        raise HTTPException(400, "Invalid session_date format (YYYY-MM-DD)")

    recording_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    content_type = CONTENT_TYPE_MAP.get(ext, "audio/wav")

    # Save to MinIO
    _ensure_bucket()
    object_path = f"{org_id}/{store_id}/{seller_id}/{sess_date}/{recording_id}{ext}"
    upload_bytes(BUCKET, object_path, audio_bytes, content_type=content_type)
    audio_path = f"{BUCKET}/{object_path}"

    # Create Recording record
    await db.execute(text("""
        INSERT INTO recorder.recordings
            (id, organization_id, store_id, seller_id, device_id, session_date,
             started_at, audio_path, file_size_bytes, status, created_at, updated_at)
        VALUES
            (:id, :org_id, :store_id, :seller_id, :device_id, :session_date,
             :started_at, :audio_path, :file_size, 'processing', :now, :now)
    """), {
        "id": recording_id,
        "org_id": uuid.UUID(org_id),
        "store_id": uuid.UUID(seller_id) if seller_id else None,
        "seller_id": uuid.UUID(seller_id),
        "device_id": uuid.UUID("00000000-0000-0000-0000-000000000000"),
        "session_date": sess_date,
        "started_at": now,
        "audio_path": audio_path,
        "file_size": len(audio_bytes),
        "now": now,
    })
    # Fix store_id param
    await db.execute(text("""
        UPDATE recorder.recordings SET store_id = :store_id WHERE id = :id
    """), {"store_id": uuid.UUID(store_id), "id": recording_id})
    await db.commit()

    # Launch background transcription
    background_tasks.add_task(
        _transcribe_and_enqueue,
        recording_id=recording_id,
        audio_bytes=audio_bytes,
        ext=ext,
        org_id=org_id,
        store_id=store_id,
        seller_id=seller_id,
        session_date=session_date,
        audio_path=audio_path,
    )

    return {
        "recording_id": str(recording_id),
        "status": "processing",
        "message": "Файл загружен, транскрибация запущена",
    }


async def _transcribe_and_enqueue(
    recording_id: uuid.UUID,
    audio_bytes: bytes,
    ext: str,
    org_id: str,
    store_id: str,
    seller_id: str,
    session_date: str,
    audio_path: str = "",
):
    """Background task: call Deepgram -> save transcript -> publish to diarize queue."""
    transcript_id = uuid.uuid4()
    try:
        filename = f"audio{ext}"
        logger.info(
            f"Sending {len(audio_bytes)} bytes to Deepgram for recording_id={recording_id}"
        )
        try:
            whisper_result = await transcribe_audio(audio_bytes, filename)
        except Exception as e:
            logger.error(f"Deepgram error: {e}", exc_info=True)
            await _update_recording_status(recording_id, "failed")
            return

        full_text = whisper_result.get("text", "")
        language = whisper_result.get("language", "ru")
        whisper_segments = whisper_result.get("segments", [])
        logger.info(
            f"Transcription complete for recording_id={recording_id}, "
            f"{len(whisper_segments)} segments, text_len={len(full_text)}"
        )

        # 2. Build segment list from Deepgram output (с speaker_id из diarization)
        segments = []
        for seg in whisper_segments:
            start_ms = int(seg.get("start", 0) * 1000)
            end_ms = int(seg.get("end", 0) * 1000)
            text_seg = seg.get("text", "").strip()
            if text_seg:
                segments.append({
                    "text": text_seg,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "speaker": seg.get("speaker"),  # ID кластера говорящего от Deepgram
                })

        if not segments and full_text:
            segments = [{"text": full_text, "start_ms": 0, "end_ms": 0, "speaker": None}]

        # Compute duration
        duration_seconds = 0
        if whisper_segments:
            duration_seconds = int(whisper_segments[-1].get("end", 0))
        elif segments:
            duration_seconds = max(s["end_ms"] for s in segments) // 1000

        # 3. Save transcript + segments to DB
        async with async_session_maker() as db:
            await db.execute(text("""
                INSERT INTO transcription.transcripts
                    (id, recording_id, organization_id, store_id, seller_id,
                     full_text, language, duration_seconds, status, whisper_model, created_at)
                VALUES
                    (:id, :rec_id, :org_id, :store_id, :seller_id,
                     :full_text, 'ru', :duration, 'transcribed', 'deepgram-whisper', :now)
            """), {
                "id": transcript_id,
                "rec_id": recording_id,
                "org_id": uuid.UUID(org_id),
                "store_id": uuid.UUID(store_id),
                "seller_id": uuid.UUID(seller_id),
                "full_text": full_text,
                "duration": duration_seconds,
                "now": datetime.now(timezone.utc),
            })

            for idx, seg in enumerate(segments):
                seg_id = uuid.uuid4()
                await db.execute(text("""
                    INSERT INTO transcription.transcript_segments
                        (id, transcript_id, speaker_role, speaker_id, text, start_ms, end_ms, segment_index)
                    VALUES
                        (:id, :t_id, :role, :speaker_id, :text, :start_ms, :end_ms, :idx)
                """), {
                    "id": seg_id,
                    "t_id": transcript_id,
                    "text": seg["text"],
                    "start_ms": seg["start_ms"],
                    "end_ms": seg["end_ms"],
                    "idx": idx,
                    "role": "unknown",
                    "speaker_id": seg.get("speaker"),
                })

            await db.execute(text("""
                UPDATE recorder.recordings
                SET status = 'transcribed', duration_seconds = :dur, updated_at = :now
                WHERE id = :id
            """), {"dur": duration_seconds, "now": datetime.now(timezone.utc), "id": recording_id})

            await db.commit()

        logger.info(f"Saved {len(segments)} segments for recording_id={recording_id}")

        # 4. Publish to queue.diarize for Qwen role assignment
        await publish("queue.diarize", {
            "audio_path": audio_path,
            "recording_id": str(recording_id),
            "transcript_id": str(transcript_id),
            "seller_id": seller_id,
            "store_id": store_id,
            "organization_id": org_id,
        })
        logger.info(f"Published to queue.diarize for recording_id={recording_id}")

    except Exception as e:
        logger.error(f"Transcription pipeline error: {e}", exc_info=True)
        await _update_recording_status(recording_id, "failed")


async def _update_recording_status(recording_id: uuid.UUID, status: str):
    try:
        async with async_session_maker() as db:
            await db.execute(text("""
                UPDATE recorder.recordings SET status = :status, updated_at = :now WHERE id = :id
            """), {"status": status, "now": datetime.now(timezone.utc), "id": recording_id})
            await db.commit()
    except Exception as e:
        logger.error(f"Could not update recording status: {e}")
