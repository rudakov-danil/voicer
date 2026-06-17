from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.minio_client import get_minio, get_presigned_url
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


@router.get("/recordings/{recording_id}/audio/stream")
async def stream_audio(
    recording_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream audio bytes through the API gateway.

    Why: presigned MinIO URLs reference the internal hostname (`minio:9000`),
    which the browser cannot resolve. Streaming through the recorder-service
    keeps the audio reachable via the existing API gateway and preserves auth.
    """
    q = select(Recording).where(Recording.id == recording_id)
    q = _apply_access(q, current_user)
    recording = (await db.execute(q)).scalar_one_or_none()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    parts = recording.audio_path.split("/", 1)
    bucket = parts[0]
    object_name = parts[1]

    client = get_minio()
    try:
        stat = client.stat_object(bucket, object_name)
        content_type = stat.content_type or "audio/wav"
        size = stat.size
    except Exception:
        raise HTTPException(status_code=404, detail="Audio file not found")

    response = client.get_object(bucket, object_name)

    def iterator():
        try:
            for chunk in response.stream(64 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    if size:
        headers["Content-Length"] = str(size)

    return StreamingResponse(iterator(), media_type=content_type, headers=headers)


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
    source: str = "badge"
    call_direction: Optional[str] = None
    client_phone: Optional[str] = None
    operator_phone: Optional[str] = None


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
        source=data.source,
        call_direction=data.call_direction,
        client_phone=data.client_phone,
        operator_phone=data.operator_phone,
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
