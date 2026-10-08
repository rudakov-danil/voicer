"""coaching items: разговоры, отложенные руководителем для разбора с продавцом

Кнопка «Разобрать с продавцом» и комментарий к разговору. Запись без текста —
просто «разговор в плане разбора»; с текстом — комментарий руководителя.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coaching_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", UUID(as_uuid=True), nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("moment_seconds", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        schema="analytics",
    )
    op.create_index("idx_coaching_conv", "coaching_items", ["conversation_id"], schema="analytics")
    op.create_index(
        "idx_coaching_org_seller_status", "coaching_items", ["organization_id", "seller_id", "status"],
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_index("idx_coaching_org_seller_status", table_name="coaching_items", schema="analytics")
    op.drop_index("idx_coaching_conv", table_name="coaching_items", schema="analytics")
    op.drop_table("coaching_items", schema="analytics")
