"""telephony_settings: scorable_categories (какие категории звонков идут в рейтинг)

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL → analytics-engine применяет дефолт (['sales']). Список кодов категорий:
    # sales | service | non_target | other.
    op.add_column(
        "telephony_settings",
        sa.Column("scorable_categories", JSONB, nullable=True),
        schema="recorder",
    )


def downgrade() -> None:
    op.drop_column("telephony_settings", "scorable_categories", schema="recorder")
