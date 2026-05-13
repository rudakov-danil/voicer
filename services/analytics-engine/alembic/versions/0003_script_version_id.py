"""link conversation script results to script template version

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_script_results",
        sa.Column("script_template_version_id", UUID(as_uuid=True), nullable=True),
        schema="analytics",
    )
    op.create_index(
        "idx_csr_template_version",
        "conversation_script_results",
        ["script_template_version_id"],
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_index("idx_csr_template_version", table_name="conversation_script_results", schema="analytics")
    op.drop_column("conversation_script_results", "script_template_version_id", schema="analytics")
