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
    source: str = "badge"
    call_direction: Optional[str] = None
    client_phone: Optional[str] = None
    operator_phone: Optional[str] = None
    error_message: Optional[str] = None

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
