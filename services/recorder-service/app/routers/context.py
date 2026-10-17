"""Internal, idempotent disposal of confidently unrelated coffee-shop recordings."""
import hmac
import json
import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.database import get_db
from app.minio_client import delete_object

router = APIRouter(prefix="/api/v1/recorder/recordings", tags=["internal-context"])
logger = logging.getLogger(__name__)


def internal_only(x_internal_key: str | None = Header(default=None)):
    if (not settings.INTERNAL_SERVICE_KEY or not x_internal_key
            or not hmac.compare_digest(x_internal_key.encode(), settings.INTERNAL_SERVICE_KEY.encode())):
        raise HTTPException(403, "Internal service access required")


class DiscardContext(BaseModel):
    organization_id: UUID
    transcript_id: UUID
    category: Literal["non_customer"]
    confidence: float = Field(ge=0.9, le=1, strict=True)
    reason: Literal["staff_conversation", "personal_conversation", "microphone_test", "media", "no_speech"]


@router.post("/{recording_id}/discard-context", dependencies=[Depends(internal_only)])
async def discard_context(recording_id: UUID, body: DiscardContext, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        SELECT r.*, o.industry FROM recorder.recordings r
        JOIN auth.organizations o ON o.id = r.organization_id
        WHERE r.id = :id AND r.organization_id = :org FOR UPDATE OF r
    """), {"id": recording_id, "org": body.organization_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Recording not found")
    if row["industry"] != "coffee" or row["source"] in ("call_manual", "call_webhook") or row["call_direction"]:
        raise HTTPException(409, "Context disposal only applies to coffee-shop interactions")
    params = {"id": recording_id, "org": body.organization_id, "transcript": body.transcript_id}
    # Published reward snapshots are an audit trail, not disposable processing data.
    if (await db.execute(text("SELECT 1 FROM analytics.coin_events WHERE recording_id=:id LIMIT 1"), params)).first():
        raise HTTPException(409, "Recording has reward history and requires manual review")
    if row["status"] != "filtered" and not (await db.execute(text("""
        SELECT 1 FROM transcription.transcripts
        WHERE id=:transcript AND recording_id=:id AND organization_id=:org
    """), params)).first():
        raise HTTPException(409, "Transcript does not belong to this recording")

    audio_path = row["audio_path"] or ""
    if audio_path and row["source"] != "transcript":
        expected = f"voiceiq-recordings/{body.organization_id}/{row['store_id']}/{row['seller_id']}/"
        if not audio_path.startswith(expected) or ".." in audio_path.split("/"):
            raise HTTPException(409, "Audio path does not belong to this recording")

    if row["status"] != "filtered":
        await db.execute(text("DELETE FROM analytics.conversations WHERE recording_id=:id AND organization_id=:org"), params)
        await db.execute(text("""
            DELETE FROM transcription.transcript_segments WHERE transcript_id IN (
                SELECT id FROM transcription.transcripts WHERE recording_id=:id AND organization_id=:org)
        """), params)
        await db.execute(text("DELETE FROM transcription.transcripts WHERE recording_id=:id AND organization_id=:org"), params)
        decision = {"category": body.category, "confidence": body.confidence, "reason": body.reason}
        await db.execute(text("""
            UPDATE recorder.recordings SET status='filtered', updated_at=now(),
                error_message='Отсеяно: нет общения гостя с бариста',
                call_metadata=jsonb_set(COALESCE(call_metadata,'{}'::jsonb),
                    '{context_filter}',CAST(:decision AS jsonb),true)
            WHERE id=:id AND organization_id=:org
        """), {**params, "decision": json.dumps(decision)})
        await db.commit()

    # Commit the tombstone before storage I/O. If storage is unavailable, redelivery
    # retries this cleanup using the retained path, without another model request.
    if audio_path and row["source"] != "transcript":
        bucket, key = audio_path.split("/", 1)
        try:
            await run_in_threadpool(delete_object, bucket, key)
        except Exception:
            logger.exception("Filtered audio cleanup failed for recording=%s", recording_id)
            raise HTTPException(503, "Filtered audio cleanup will be retried")
    await db.execute(text("""
        UPDATE recorder.recordings SET audio_path='', file_size_bytes=0, updated_at=now()
        WHERE id=:id AND organization_id=:org AND status='filtered'
    """), params)
    await db.commit()
    return {"recording_id": str(recording_id), "status": "filtered"}
