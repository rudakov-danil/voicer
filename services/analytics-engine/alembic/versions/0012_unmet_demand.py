"""unmet demand: what customers asked for and did not get, and the procurement list

Покупатель спросил товар, а его нет в наличии или в ассортименте («Нурофен есть?» — «Закончился»).
Каждая такая просьба — строка conversation_demand с исходом: купил аналог, оформили заказ
под покупателя или ушёл без покупки. Из них руководитель собирает список к закупке:
решение по позиции (в закупку, заказано, не закупаем) хранится в demand_items отдельно от
разговоров — повторный анализ разговора его не стирает.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_demand",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False,
        ),
        # Как назвал покупатель — для списка; item_key — для группировки одинаковых просьб
        sa.Column("item", sa.String(255), nullable=False),
        sa.Column("item_key", sa.String(255), nullable=False),
        # Аптека: rx | otc | supplement | medical | cosmetics | baby | other; прочие отрасли — other
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        # out_of_stock — закончился сейчас; not_carried — такого в ассортименте нет
        sa.Column("reason", sa.String(20), nullable=False, server_default="out_of_stock"),
        # substituted — купил аналог; ordered — заказали или отложили под покупателя;
        # lost — ушёл без этого товара; unknown — по разговору не понять
        sa.Column("outcome", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("analog", sa.String(255), nullable=True),
        sa.Column("quote", sa.Text, nullable=False, server_default=""),
        sa.Column("seller_quote", sa.Text, nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        schema="analytics",
    )
    op.create_index("idx_demand_conversation", "conversation_demand", ["conversation_id"], schema="analytics")
    op.create_index("idx_demand_item_key", "conversation_demand", ["item_key"], schema="analytics")

    op.create_table(
        "demand_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        # new — ещё не разбирали; to_order — в закупку; ordered — заказано у поставщика; ignored — не закупаем
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "item_key", name="uq_demand_items_org_key"),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_table("demand_items", schema="analytics")
    op.drop_index("idx_demand_item_key", table_name="conversation_demand", schema="analytics")
    op.drop_index("idx_demand_conversation", table_name="conversation_demand", schema="analytics")
    op.drop_table("conversation_demand", schema="analytics")
