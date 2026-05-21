"""compliance_violations table — нарушения правил коммуникации, найденные LLM

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_compliance_violations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Привязка к конкретному правилу из scripts.compliance_rules (FK не делаем — кросс-схемный
        # сервис; правило может быть удалено, snapshot сохраняем в title/severity).
        sa.Column("rule_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rule_title", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False, server_default="medium"),
        # Дословная цитата из транскрипта — для подсветки в UI.
        sa.Column("evidence", sa.Text, nullable=False, server_default=""),
        # Краткое объяснение LLM, почему это нарушение.
        sa.Column("explanation", sa.Text, nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        schema="analytics",
    )
    op.create_index(
        "idx_compliance_violations_conv",
        "conversation_compliance_violations",
        ["conversation_id"],
        schema="analytics",
    )
    op.create_index(
        "idx_compliance_violations_rule",
        "conversation_compliance_violations",
        ["rule_id"],
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_index("idx_compliance_violations_rule", table_name="conversation_compliance_violations", schema="analytics")
    op.drop_index("idx_compliance_violations_conv", table_name="conversation_compliance_violations", schema="analytics")
    op.drop_table("conversation_compliance_violations", schema="analytics")
