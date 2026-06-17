import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    UUID, String, Text, Boolean, Integer, Numeric,
    ForeignKey, UniqueConstraint, Index, TIMESTAMP
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
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
    short_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    description: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="org_level")
    context_description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    applies_to_all_stores: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # staged — классический скрипт из этапов с весами; fulltext — полнотекстовый скрипт,
    # загруженный документом и разбитый на блоки (отслеживание покрытия по блокам)
    script_type: Mapped[str] = mapped_column(String(10), nullable=False, default="staged", server_default="staged")
    # Для fulltext: имя исходного документа и его полный распарсенный текст
    source_document_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    steps: Mapped[list["ScriptStep"]] = relationship("ScriptStep", back_populates="template", cascade="all, delete-orphan", order_by="ScriptStep.step_order")
    blocks: Mapped[list["ScriptBlock"]] = relationship("ScriptBlock", back_populates="template", cascade="all, delete-orphan", order_by="ScriptBlock.block_order")
    assignments: Mapped[list["SellerScriptAssignment"]] = relationship("SellerScriptAssignment", back_populates="template")
    store_assignments: Mapped[list["StoreScriptAssignment"]] = relationship("StoreScriptAssignment", back_populates="template")
    versions: Mapped[list["ScriptTemplateVersion"]] = relationship(
        "ScriptTemplateVersion", back_populates="template",
        cascade="all, delete-orphan", order_by="ScriptTemplateVersion.version_number",
    )


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
    # Эталонные фразы — образцы того, как этап должен звучать в речи продавца.
    # Передаются LLM в промте для лучшей точности оценки.
    example_phrases: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="steps")


class ScriptBlock(Base):
    """Блок полнотекстового скрипта (script_type=fulltext): фраза или смысловая секция,
    которую сотрудник должен проговорить. По блокам считается покрытие скрипта."""
    __tablename__ = "script_blocks"
    __table_args__ = (
        UniqueConstraint("template_id", "block_order"),
        Index("idx_script_blocks_template", "template_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scripts.script_templates.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # greeting | identification | need_discovery | presentation | objection_response | closing | other
    block_type: Mapped[str] = mapped_column(String(30), nullable=False, default="other", server_default="other")
    # Обязательный блок входит в балл покрытия; ситуативный (false) — только в отчёт
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    block_order: Mapped[int] = mapped_column(Integer, nullable=False)

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="blocks")


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


class StoreScriptAssignment(Base):
    __tablename__ = "store_script_assignments"
    __table_args__ = (
        UniqueConstraint("store_id", "template_id"),
        Index("idx_store_assignments_store", "store_id"),
        Index("idx_store_assignments_org", "organization_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    store_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scripts.script_templates.id", ondelete="RESTRICT"), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="store_assignments")


class ScriptTemplateVersion(Base):
    """Snapshot шаблона на момент сохранения.
    При каждом PUT существующего шаблона мы фиксируем СТАРОЕ состояние перед перезаписью
    + создаём новую запись после. Это даёт историю и возможность сравнения версий.
    """
    __tablename__ = "script_template_versions"
    __table_args__ = (
        UniqueConstraint("template_id", "version_number"),
        Index("idx_template_versions_template", "template_id", "version_number"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scripts.script_templates.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)

    template: Mapped["ScriptTemplate"] = relationship("ScriptTemplate", back_populates="versions")


class CrossSellRule(Base):
    """Правило кросс-сейла: при обсуждении trigger_product продавец должен
    предложить required_offers (продукт-сопутствующее, не дороже базового).
    Полностью симметрично UpsellRule, но семантика — кросс, а не апсейл.
    """
    __tablename__ = "cross_sell_rules"
    __table_args__ = (
        Index("idx_cross_sell_rules_org", "organization_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Пустой массив = правило-дефолт уровня организации (все магазины).
    store_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list, server_default="{}")
    # Пустой массив = все продавцы покрытых магазинов; иначе — только указанные.
    seller_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list, server_default="{}")
    trigger_product: Mapped[str] = mapped_column(String(255), nullable=False)
    required_offers: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class UpsellRule(Base):
    __tablename__ = "upsell_rules"
    __table_args__ = (
        Index("idx_upsell_rules_org", "organization_id"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Пустой массив = правило-дефолт уровня организации (все магазины).
    store_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list, server_default="{}")
    # Пустой массив = все продавцы покрытых магазинов; иначе — только указанные.
    seller_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list, server_default="{}")
    trigger_product: Mapped[str] = mapped_column(String(255), nullable=False)
    required_offers: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ObjectionType(Base):
    """Справочник типов возражений организации. LLM при общем анализе получает активные
    типы (код, название, описание, примеры фраз) и классифицирует найденные возражения
    по этим кодам. При первом обращении организации сидируются 7 стандартных типов."""
    __tablename__ = "objection_types"
    __table_args__ = (
        UniqueConstraint("organization_id", "code"),
        Index("idx_objection_types_org_active", "organization_id", "is_active"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Код пишется в analytics.objections.type (String(30)) — латиница/цифры/подчёркивание
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # Примеры фраз клиента — учат LLM отраслевой специфике
    example_phrases: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    # Стандартный тип из стартового набора (нельзя удалить, можно выключить/переименовать)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ComplianceRule(Base):
    """Правила общей коммуникации (без ругательств, не конфликтовать с клиентом и т.п.).
    LLM получает список активных правил организации в промпте и помечает нарушения с
    привязкой к конкретному правилу.
    """
    __tablename__ = "compliance_rules"
    __table_args__ = (
        Index("idx_compliance_rules_org_active", "organization_id", "is_active"),
        {"schema": "scripts"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="medium", server_default="medium")
    keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
