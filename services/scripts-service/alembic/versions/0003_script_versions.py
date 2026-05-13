"""script versioning: snapshot table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "script_template_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("template_id", UUID(as_uuid=True),
                  sa.ForeignKey("scripts.script_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("template_id", "version_number"),
        schema="scripts",
    )
    op.create_index(
        "idx_template_versions_template",
        "script_template_versions",
        ["template_id", "version_number"],
        schema="scripts",
    )


def downgrade() -> None:
    op.drop_index("idx_template_versions_template", table_name="script_template_versions", schema="scripts")
    op.drop_table("script_template_versions", schema="scripts")
