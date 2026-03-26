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
