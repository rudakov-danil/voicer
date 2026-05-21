"""compliance rules — общие правила коммуникации продавца с клиентом

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        # high | medium | low
        sa.Column("severity", sa.String(10), nullable=False, server_default="medium"),
        # Ключевые слова больше не используются для матчинга (LLM получает правило целиком),
        # но оставляем для будущих фильтров/поиска.
        sa.Column("keywords", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("severity IN ('high','medium','low')", name="compliance_rules_severity_check"),
        schema="scripts",
    )
    op.create_index(
        "idx_compliance_rules_org_active",
        "compliance_rules",
        ["organization_id", "is_active"],
        schema="scripts",
    )


def downgrade() -> None:
    op.drop_index("idx_compliance_rules_org_active", table_name="compliance_rules", schema="scripts")
    op.drop_table("compliance_rules", schema="scripts")
