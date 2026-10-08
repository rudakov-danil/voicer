"""cached AI summary of the dialog on conversations

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("summary", sa.Text, nullable=True), schema="analytics")
    op.add_column(
        "conversations",
        sa.Column("summary_generated_at", sa.TIMESTAMP(timezone=True), nullable=True),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_column("conversations", "summary_generated_at", schema="analytics")
    op.drop_column("conversations", "summary", schema="analytics")
