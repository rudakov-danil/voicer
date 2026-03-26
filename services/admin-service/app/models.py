import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    sellers = relationship("Seller", back_populates="store")
    devices = relationship("Device", back_populates="store")


class Seller(Base):
    __tablename__ = "sellers"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    store = relationship("Store", back_populates="sellers")


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.sellers.id", ondelete="SET NULL"), nullable=True)
    serial_number = Column(String(100), nullable=False, unique=True)
    model = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    store = relationship("Store", back_populates="devices")
    seller = relationship("Seller")


class PrivacySettings(Base):
    __tablename__ = "privacy_settings"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True)
    retention_days = Column(Integer, nullable=False, default=90)
    anonymize_transcripts = Column(Boolean, nullable=False, default=False)
    consent_required = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class AlertSettings(Base):
    __tablename__ = "alert_settings"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True)
    score_threshold = Column(Integer, nullable=False, default=60)
    no_activity_hours = Column(Integer, nullable=True, default=4)
    email_recipients = Column(ARRAY(Text), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class StoreLicense(Base):
    __tablename__ = "store_licenses"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    starts_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    granted_by = Column(UUID(as_uuid=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
