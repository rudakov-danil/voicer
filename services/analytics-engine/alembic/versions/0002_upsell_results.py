"""upsell columns on conversations

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("has_upsell", sa.Boolean, nullable=True),
        schema="analytics",
    )
    op.add_column(
        "conversations",
        sa.Column("upsell_results", JSONB, nullable=True),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_column("conversations", "upsell_results", schema="analytics")
    op.drop_column("conversations", "has_upsell", schema="analytics")
