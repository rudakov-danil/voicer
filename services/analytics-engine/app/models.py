import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    UUID, String, Text, Boolean, Integer, Numeric, Date,
    ForeignKey, UniqueConstraint, Index, TIMESTAMP, ARRAY
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("idx_conversations_org", "organization_id"),
        Index("idx_conversations_store", "store_id"),
        Index("idx_conversations_seller", "seller_id"),
        Index("idx_conversations_date", "session_date"),
        Index("idx_conversations_score", "overall_score"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recording_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    transcript_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    store_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    outcome_confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    topic: Mapped[str | None] = mapped_column(String(500))
    sentiment_avg: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    analyzed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    llm_model: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="analyzed")
    # Агрегат: True если ХОТЯ БЫ ОДНО релевантное правило апсейла было закрыто (offered_items не пуст).
    # NULL = апсейл не проверялся (нет правил или не работал).
    has_upsell: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Детализация по каждому сработавшему правилу: [{rule_id, trigger_product, required_offers,
    # offered_items, missed_items, evidence}, ...]
    upsell_results: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    script_results: Mapped[list["ConversationScriptResult"]] = relationship(
        "ConversationScriptResult", back_populates="conversation", cascade="all, delete-orphan"
    )
    scores: Mapped[list["ConversationScore"]] = relationship(
        "ConversationScore", back_populates="conversation", cascade="all, delete-orphan"
    )
    objections: Mapped[list["Objection"]] = relationship(
        "Objection", back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationScriptResult(Base):
    __tablename__ = "conversation_script_results"
    __table_args__ = (
        UniqueConstraint("conversation_id", "script_template_id"),
        Index("idx_script_results_conversation", "conversation_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    script_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Версия шаблона на момент скоринга — позволяет смотреть аналитику по конкретной версии
    # и сравнивать v(N) vs v(N+1). NULL для разговоров, проанализированных до введения версионирования.
    script_template_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    script_name: Mapped[str] = mapped_column(String(255), nullable=False)
    was_applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    script_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    violations: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    skip_reason: Mapped[str | None] = mapped_column(Text)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="script_results")


class ConversationScore(Base):
    __tablename__ = "conversation_scores"
    __table_args__ = (
        UniqueConstraint("conversation_id", "script_step_id"),
        Index("idx_conv_scores_conversation", "conversation_id"),
        Index("idx_conv_scores_template", "script_template_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    script_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    script_step_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    step_name: Mapped[str] = mapped_column(String(255), nullable=False)
    step_weight: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    evidence_text: Mapped[str | None] = mapped_column(Text)
    step_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="scores")


class Objection(Base):
    __tablename__ = "objections"
    __table_args__ = (
        Index("idx_objections_conversation", "conversation_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resolution_technique: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="objections")
