"""currency and timezone on organizations: KZT and Asia/Almaty for a chain in Kazakhstan

NULL — как раньше: рубли и часовой пояс сервисов (Москва).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("currency", sa.String(3), nullable=True), schema="auth")
    op.add_column("organizations", sa.Column("timezone", sa.String(64), nullable=True), schema="auth")


def downgrade() -> None:
    op.drop_column("organizations", "timezone", schema="auth")
    op.drop_column("organizations", "currency", schema="auth")
