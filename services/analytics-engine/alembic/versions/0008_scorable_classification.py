"""call classification: is_scorable / call_category / contact_reason

Учёт нецелевых и сервисных звонков: неоцениваемые звонки не портят рейтинг
менеджера (overall_score=NULL, is_scorable=false).

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("is_scorable", sa.Boolean, nullable=False, server_default=sa.true()),
        schema="analytics",
    )
    op.add_column("conversations", sa.Column("call_category", sa.String(20), nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("contact_reason", sa.String(500), nullable=True), schema="analytics")


def downgrade() -> None:
    op.drop_column("conversations", "contact_reason", schema="analytics")
    op.drop_column("conversations", "call_category", schema="analytics")
    op.drop_column("conversations", "is_scorable", schema="analytics")
