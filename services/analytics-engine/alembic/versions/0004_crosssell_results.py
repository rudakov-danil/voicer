"""crosssell columns on conversations

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("has_crosssell", sa.Boolean, nullable=True),
        schema="analytics",
    )
    op.add_column(
        "conversations",
        sa.Column("crosssell_results", JSONB, nullable=True),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_column("conversations", "crosssell_results", schema="analytics")
    op.drop_column("conversations", "has_crosssell", schema="analytics")
