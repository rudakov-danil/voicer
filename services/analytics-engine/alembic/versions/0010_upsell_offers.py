"""upsell focus: offers in each conversation, shift plans, tips for the employee

Каждое предложение продавца (апсейл, кросс-сейл, размер, добавка, карта лояльности)
сохраняется отдельной строкой с приёмом и реакцией клиента. На разговоре — счётчики
для быстрых агрегатов. План смены и советы сотруднику — для экрана «Моя смена».

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Счётчики на разговоре. NULL — разбор допродаж не выполнялся (звонок, сбой LLM,
    # разговор проанализирован до этой миграции).
    op.add_column("conversations", sa.Column("offer_opportunity", sa.Boolean, nullable=True), schema="analytics")
    # Настоящие предложения; «Что-нибудь ещё?» (technique=generic) сюда не входит
    op.add_column("conversations", sa.Column("offers_count", sa.Integer, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("offers_accepted", sa.Integer, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("check_total", sa.Numeric(10, 2), nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("order_items", JSONB, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("offer_missed", sa.Text, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("offer_better_phrase", sa.Text, nullable=True), schema="analytics")

    op.create_table(
        "conversation_offers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("item", sa.String(255), nullable=False),
        # size | addon | food | drink | loyalty | promo | other
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        # upsell (дороже/больше того же) | cross_sell (сопутствующее)
        sa.Column("kind", sa.String(20), nullable=False, server_default="cross_sell"),
        # generic | specific | choice | benefit | promo
        sa.Column("technique", sa.String(20), nullable=False, server_default="specific"),
        # accepted | declined | no_answer
        sa.Column("response", sa.String(20), nullable=False, server_default="no_answer"),
        sa.Column("is_focus", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("quote", sa.Text, nullable=False, server_default=""),
        sa.Column("customer_quote", sa.Text, nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        schema="analytics",
    )
    op.create_index("idx_offers_conversation", "conversation_offers", ["conversation_id"], schema="analytics")

    # План смены. Строка без store_id и seller_id — план организации, со store_id — магазина,
    # с seller_id — сотрудника. Действует самый частный.
    op.create_table(
        "upsell_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=True),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=True),
        # Доля заказов, где было хотя бы одно предложение (0..1)
        sa.Column("attempt_rate_target", sa.Numeric(4, 3), nullable=True),
        # Сколько принятых допродаж за смену
        sa.Column("accepted_per_shift", sa.Integer, nullable=True),
        # «Товар дня»: что сеть продвигает сейчас (сезонный напиток, новинка)
        sa.Column("focus_items", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="analytics",
    )
    op.execute("""
        CREATE UNIQUE INDEX uq_upsell_plans_scope ON analytics.upsell_plans (
            organization_id,
            COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
            COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
    """)

    # Советы сотруднику по его разговорам — кэш на день
    op.create_table(
        "seller_tips",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tip_date", sa.Date, nullable=False),
        sa.Column("conversations_count", sa.Integer, nullable=False),
        sa.Column("tips", JSONB, nullable=False),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("seller_id", "tip_date", name="uq_seller_tips_day"),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_table("seller_tips", schema="analytics")
    op.execute("DROP INDEX IF EXISTS analytics.uq_upsell_plans_scope")
    op.drop_table("upsell_plans", schema="analytics")
    op.drop_index("idx_offers_conversation", table_name="conversation_offers", schema="analytics")
    op.drop_table("conversation_offers", schema="analytics")
    for col in ("offer_better_phrase", "offer_missed", "order_items", "check_total",
                "offers_accepted", "offers_count", "offer_opportunity"):
        op.drop_column("conversations", col, schema="analytics")
