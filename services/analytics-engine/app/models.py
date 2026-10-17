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
    # offered_items, missed_items, evidence, trigger_quotes, offer_quotes}, ...]
    upsell_results: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Аналог для кросс-сейла. Структура и семантика симметричны upsell.
    has_crosssell: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    crosssell_results: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # ─── Метрики динамики разговора (считаются из таймкодов сегментов, без LLM) ───
    # Доля времени речи продавца/оператора от всего времени речи (0..1)
    talk_ratio: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    # Сколько раз стороны перебивали друг друга (пересечение таймкодов реплик)
    interruptions_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Самый длинный непрерывный монолог продавца/оператора, секунды
    longest_monologue_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Доля тишины (паузы между репликами) от длительности разговора (0..1)
    silence_ratio: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)

    # ─── Резюме диалога (генерируется LLM по запросу из карточки, кэшируется) ────
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_generated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # ─── Классификация обращения (учёт нецелевых/сервисных звонков) ──────────────
    # is_scorable=false → звонок не оценивается по скрипту продаж и НЕ влияет на
    # рейтинг менеджера (overall_score=NULL). Задаётся из call_category + org-настройки.
    is_scorable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # sales | service | non_target | other (только для звонков; для розницы None)
    call_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Краткая причина обращения клиента (тегирование причин звонков)
    contact_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ─── Допродажи (разбор предложений, миграция 0010) ───────────────────────────
    # NULL во всех полях — разбор не выполнялся (звонок, сбой LLM, старый разговор).
    # Была ли возможность предложить: клиент что-то заказывал/покупал
    offer_opportunity: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    offers_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offers_accepted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Сумма чека, если прозвучала в разговоре
    check_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Состав заказа: ["капучино 0,3", "круассан"]
    order_items: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Что можно было предложить, если предложения не было или оно было слабым
    offer_missed: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Как можно было сказать лучше — готовая фраза для сотрудника
    offer_better_phrase: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    # Для полнотекстовых скриптов (script_type=fulltext): покрытие по блокам.
    # [{block_id, title, is_mandatory, status: spoken|paraphrased|missed, quote, comment}, ...]
    block_results: Mapped[list | None] = mapped_column(JSONB, nullable=True)

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


class ConversationComplianceViolation(Base):
    """Нарушения правил коммуникации, найденные LLM с привязкой к конкретному правилу.
    rule_id ссылается на scripts.compliance_rules.id (без FK — другая схема/сервис).
    """
    __tablename__ = "conversation_compliance_violations"
    __table_args__ = (
        Index("idx_compliance_violations_conv", "conversation_id"),
        Index("idx_compliance_violations_rule", "rule_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    rule_title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    evidence: Mapped[str] = mapped_column(Text, nullable=False, default="")
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ConversationOffer(Base):
    """Одно предложение продавца в разговоре: что предложил, каким приёмом и как
    отреагировал клиент. Основа аналитики допродаж и экрана «Моя смена»."""
    __tablename__ = "conversation_offers"
    __table_args__ = (
        Index("idx_offers_conversation", "conversation_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    item: Mapped[str] = mapped_column(String(255), nullable=False)
    # size | addon | food | drink | loyalty | promo | other
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    # upsell | cross_sell
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="cross_sell")
    # generic | specific | choice | benefit | promo
    technique: Mapped[str] = mapped_column(String(20), nullable=False, default="specific")
    # accepted | declined | no_answer
    response: Mapped[str] = mapped_column(String(20), nullable=False, default="no_answer")
    # Предложен «товар дня» из плана
    is_focus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    customer_quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Цена предложенного (для upsell — доплата), если прозвучала; NULL — неизвестна
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ConversationDemand(Base):
    """Неудовлетворённый спрос: покупатель спросил товар, которого нет в наличии или в ассортименте.
    Из этих строк руководитель собирает список к закупке (dashboard /demand)."""
    __tablename__ = "conversation_demand"
    __table_args__ = (
        Index("idx_demand_conversation", "conversation_id"),
        Index("idx_demand_item_key", "item_key"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    item: Mapped[str] = mapped_column(String(255), nullable=False)
    item_key: Mapped[str] = mapped_column(String(255), nullable=False)
    # rx | otc | supplement | medical | cosmetics | baby | other
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    # out_of_stock | not_carried
    reason: Mapped[str] = mapped_column(String(20), nullable=False, default="out_of_stock")
    # substituted | ordered | lost | unknown
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    analog: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    seller_quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ClinicVisit(Base):
    """Итог проверки приёма в клинике (миграция 0014): баллы и число сигналов. Протокол — в
    visit_protocols (ключ — запись, чтобы повторный анализ не стирал правки врача)."""
    __tablename__ = "clinic_visits"
    __table_args__ = {"schema": "analytics"}

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), primary_key=True
    )
    is_visit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # primary | follow_up
    visit_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    service_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    competence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    issue_signals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fraud_signals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    checks_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class VisitCheck(Base):
    """Результат правила контроля на приёме: «должно быть» — met | partial | missed | na,
    «не должно быть» — violated (хранятся только сработавшие). Название — снимок на момент анализа."""
    __tablename__ = "visit_checks"
    __table_args__ = (
        Index("idx_visit_checks_conversation", "conversation_id"),
        Index("idx_visit_checks_rule", "rule_id"),
        {"schema": "analytics"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


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
