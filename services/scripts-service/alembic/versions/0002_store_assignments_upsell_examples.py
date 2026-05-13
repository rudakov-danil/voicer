"""store-level script assignments, upsell rules, example phrases on steps

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) example_phrases на этапах — список «эталонных» формулировок для подсказки LLM
    op.add_column(
        "script_steps",
        sa.Column("example_phrases", ARRAY(sa.Text), nullable=False, server_default="{}"),
        schema="scripts",
    )

    # 2) Назначения на магазины (параллельно с seller_script_assignments)
    op.create_table(
        "store_script_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True),
                  sa.ForeignKey("scripts.script_templates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("is_mandatory", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("assigned_by", UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("store_id", "template_id"),
        schema="scripts",
    )
    op.create_index(
        "idx_store_assignments_store", "store_script_assignments",
        ["store_id"], schema="scripts",
    )
    op.create_index(
        "idx_store_assignments_org", "store_script_assignments",
        ["organization_id"], schema="scripts",
    )

    # 3) Правила апсейла. store_id NULL = правило уровня организации (default для всех магазинов).
    op.create_table(
        "upsell_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_product", sa.String(255), nullable=False),
        sa.Column("required_offers", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="scripts",
    )
    op.create_index(
        "idx_upsell_rules_org_store", "upsell_rules",
        ["organization_id", "store_id"], schema="scripts",
    )


def downgrade() -> None:
    op.drop_index("idx_upsell_rules_org_store", table_name="upsell_rules", schema="scripts")
    op.drop_table("upsell_rules", schema="scripts")

    op.drop_index("idx_store_assignments_org", table_name="store_script_assignments", schema="scripts")
    op.drop_index("idx_store_assignments_store", table_name="store_script_assignments", schema="scripts")
    op.drop_table("store_script_assignments", schema="scripts")

    op.drop_column("script_steps", "example_phrases", schema="scripts")
