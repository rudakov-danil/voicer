import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    UUID, String, Text, Boolean, Integer, Numeric,
    ForeignKey, UniqueConstraint, Index, TIMESTAMP
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ScriptTemplate(Base):
    __tablename__ = "script_templates"
    __table_args__ = (
        UniqueConstraint("organization_id", "name"),
        Index("idx_script_templates_org", "organization_id"),
        Index("idx_script_templates_scope", "organization_id", "scope"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="org_level")
    context_description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    steps: Mapped[list["ScriptStep"]] = relationship("ScriptStep", back_populates="template", cascade="all, delete-orphan", order_by="ScriptStep.step_order")
    assignments: Mapped[list["SellerScriptAssignment"]] = relationship("SellerScriptAssignment", back_populates="template")


class ScriptStep(Base):
    __tablename__ = "script_steps"
    __table_args__ = (
        UniqueConstraint("template_id", "step_order"),
        Index("idx_script_steps_template", "template_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scripts.script_templates.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    recommendation_text: Mapped[str | None] = mapped_column(Text)

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="steps")


class SellerScriptAssignment(Base):
    __tablename__ = "seller_script_assignments"
    __table_args__ = (
        UniqueConstraint("seller_id", "template_id"),
        Index("idx_seller_assignments_seller", "seller_id"),
        Index("idx_seller_assignments_org", "organization_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scripts.script_templates.id", ondelete="RESTRICT"), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="assignments")
