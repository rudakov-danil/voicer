"""objection_types — настраиваемый справочник типов возражений организации

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "objection_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("example_phrases", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("organization_id", "code"),
        schema="scripts",
    )
    op.create_index(
        "idx_objection_types_org_active", "objection_types",
        ["organization_id", "is_active"], schema="scripts",
    )


def downgrade() -> None:
    op.drop_table("objection_types", schema="scripts")
