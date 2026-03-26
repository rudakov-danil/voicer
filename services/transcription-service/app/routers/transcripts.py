from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Transcript, TranscriptSegment
from app.schemas import TranscriptResponse, SegmentResponse

router = APIRouter(prefix="/api/v1/transcription", tags=["transcription"])


@router.get("/transcripts/{recording_id}", response_model=TranscriptResponse)
async def get_transcript(
    recording_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Transcript).where(Transcript.recording_id == recording_id).options(
        selectinload(Transcript.segments)
    )
    if current_user["role"] != "service":
        q = q.where(Transcript.organization_id == current_user["organization_id"])

    transcript = (await db.execute(q)).scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    return TranscriptResponse.model_validate(transcript)


@router.get("/transcripts/{transcript_id}/segments", response_model=list[SegmentResponse])
async def get_transcript_segments(
    transcript_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify transcript exists (and org access for non-service users)
    q = select(Transcript).where(Transcript.id == transcript_id)
    if current_user["role"] != "service":
        q = q.where(Transcript.organization_id == current_user["organization_id"])

    transcript = (await db.execute(q)).scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    segments = (await db.execute(
        select(TranscriptSegment)
        .where(TranscriptSegment.transcript_id == transcript_id)
        .order_by(TranscriptSegment.segment_index)
    )).scalars().all()

    return [SegmentResponse.model_validate(s) for s in segments]
