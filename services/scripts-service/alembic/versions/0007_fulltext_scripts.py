"""fulltext scripts: script_type on templates + script_blocks table

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "script_templates",
        sa.Column("script_type", sa.String(10), nullable=False, server_default="staged"),
        schema="scripts",
    )
    op.add_column("script_templates", sa.Column("source_document_name", sa.String(255), nullable=True), schema="scripts")
    op.add_column("script_templates", sa.Column("full_text", sa.Text, nullable=True), schema="scripts")

    op.create_table(
        "script_blocks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("scripts.script_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("block_type", sa.String(30), nullable=False, server_default="other"),
        sa.Column("is_mandatory", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("block_order", sa.Integer, nullable=False),
        sa.UniqueConstraint("template_id", "block_order"),
        schema="scripts",
    )
    op.create_index("idx_script_blocks_template", "script_blocks", ["template_id"], schema="scripts")


def downgrade() -> None:
    op.drop_table("script_blocks", schema="scripts")
    op.drop_column("script_templates", "full_text", schema="scripts")
    op.drop_column("script_templates", "source_document_name", schema="scripts")
    op.drop_column("script_templates", "script_type", schema="scripts")
