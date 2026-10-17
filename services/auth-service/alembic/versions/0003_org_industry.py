"""industry on organizations: coffee | electronics | ... (NULL — не задана)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("industry", sa.String(30), nullable=True), schema="auth")


def downgrade() -> None:
    op.drop_column("organizations", "industry", schema="auth")
