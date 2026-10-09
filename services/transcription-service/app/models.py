import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Transcript(Base):
    __tablename__ = "transcripts"
    __table_args__ = {"schema": "transcription"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recording_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), nullable=False)
    seller_id = Column(UUID(as_uuid=True), nullable=False)
    full_text = Column(Text, nullable=False)
    language = Column(String(10), nullable=False, default="ru")
    duration_seconds = Column(Integer, nullable=True)
    status = Column(String(30), nullable=False, default="transcribed")
    # transcribed | diarized | failed
    whisper_model = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    segments = relationship(
        "TranscriptSegment",
        back_populates="transcript",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.segment_index",
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    __table_args__ = {"schema": "transcription"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcript_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transcription.transcripts.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker_role = Column(String(20), nullable=False, default="unknown")
    # seller | customer | unknown
    speaker_id = Column(Integer, nullable=True)
    # ID кластера говорящего от Deepgram diarization (0, 1, 2, ...). NULL если diarize выключен.
    text = Column(Text, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    segment_index = Column(Integer, nullable=False)
    avg_logprob = Column(Numeric(6, 4), nullable=True)
    speaker_confidence = Column(Numeric(4, 3), nullable=True)
    # Уверенность Deepgram в спикере (0..1). Ниже SPEAKER_CONFIDENCE_MIN спикера проверяет LLM

    transcript = relationship("Transcript", back_populates="segments")
