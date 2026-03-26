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
