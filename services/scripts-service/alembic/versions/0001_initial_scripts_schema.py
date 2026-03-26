"""initial scripts schema

Revision ID: 0001
Revises:
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS scripts")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "script_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("scope", sa.String(20), nullable=False, server_default="org_level"),
        sa.Column("context_description", sa.Text),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("organization_id", "name"),
        schema="scripts",
    )
    op.create_index("idx_script_templates_org", "script_templates", ["organization_id"], schema="scripts")
    op.create_index("idx_script_templates_scope", "script_templates", ["organization_id", "scope"], schema="scripts")

    op.create_table(
        "script_steps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("scripts.script_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("weight", sa.Numeric(4, 3), nullable=False),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("step_order", sa.Integer, nullable=False),
        sa.Column("recommendation_text", sa.Text),
        sa.UniqueConstraint("template_id", "step_order"),
        schema="scripts",
    )
    op.create_index("idx_script_steps_template", "script_steps", ["template_id"], schema="scripts")

    op.create_table(
        "seller_script_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("scripts.script_templates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("is_mandatory", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("assigned_by", UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("seller_id", "template_id"),
        schema="scripts",
    )
    op.create_index("idx_seller_assignments_seller", "seller_script_assignments", ["seller_id"], schema="scripts")
    op.create_index("idx_seller_assignments_org", "seller_script_assignments", ["organization_id"], schema="scripts")


def downgrade() -> None:
    op.drop_table("seller_script_assignments", schema="scripts")
    op.drop_table("script_steps", schema="scripts")
    op.drop_table("script_templates", schema="scripts")
    op.execute("DROP SCHEMA IF EXISTS scripts CASCADE")
