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

    # Stitch is triggered only on finalize — not during upload.
    # Badges upload all chunks when placed on charger, so we wait
    # for the explicit finalize signal before starting stitching.

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
