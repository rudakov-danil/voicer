import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Date, Integer, BigInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

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
    # Источник записи: badge (бейдж/док-станция), manual (ручная загрузка аудио),
    # transcript (прямая загрузка транскрипта), call_manual (звонок, ручная загрузка),
    # call_webhook (звонок от АТС по вебхуку)
    source = Column(String(20), nullable=False, default="badge", server_default="badge")
    call_direction = Column(String(10), nullable=True)  # inbound | outbound
    client_phone = Column(String(32), nullable=True)
    operator_phone = Column(String(32), nullable=True)
    external_call_id = Column(String(128), nullable=True)  # ID звонка в АТС
    call_metadata = Column(JSONB, nullable=True)  # очередь, время ожидания и прочее от АТС
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class TelephonySettings(Base):
    """Настройки приёма звонков для организации: токен вебхука, дефолты для записей,
    которые АТС присылает без явного указания отдела/оператора."""
    __tablename__ = "telephony_settings"
    __table_args__ = {"schema": "recorder"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    is_enabled = Column(Boolean, nullable=False, default=True)
    webhook_token = Column(String(64), nullable=False, unique=True)
    default_store_id = Column(UUID(as_uuid=True), nullable=True)
    default_seller_id = Column(UUID(as_uuid=True), nullable=True)
    # Номер канала с голосом оператора в стерео-записях АТС (обычно 0)
    operator_channel = Column(Integer, nullable=False, default=0)
    # Сопоставление добавочного номера оператора -> seller_id: {"101": "uuid", ...}
    operator_mapping = Column(JSONB, nullable=True)
    # Категории звонков, которые идут в рейтинг менеджера (оцениваются по скрипту):
    # список кодов sales|service|non_target|other. NULL → дефолт (['sales']) в analytics-engine.
    scorable_categories = Column(JSONB, nullable=True)
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
