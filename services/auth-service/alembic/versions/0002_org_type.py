"""org_type on organizations: retail | telephony

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("org_type", sa.String(20), nullable=False, server_default="retail"),
        schema="auth",
    )


def downgrade() -> None:
    op.drop_column("organizations", "org_type", schema="auth")
