"""cross-sell rules + applies_to_all_stores flag

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "script_templates",
        sa.Column("applies_to_all_stores", sa.Boolean, nullable=False, server_default=sa.false()),
        schema="scripts",
    )

    op.create_table(
        "cross_sell_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_product", sa.String(255), nullable=False),
        sa.Column("required_offers", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="scripts",
    )
    op.create_index(
        "idx_cross_sell_rules_org_store",
        "cross_sell_rules",
        ["organization_id", "store_id"],
        schema="scripts",
    )


def downgrade() -> None:
    op.drop_index("idx_cross_sell_rules_org_store", table_name="cross_sell_rules", schema="scripts")
    op.drop_table("cross_sell_rules", schema="scripts")
    op.drop_column("script_templates", "applies_to_all_stores", schema="scripts")
