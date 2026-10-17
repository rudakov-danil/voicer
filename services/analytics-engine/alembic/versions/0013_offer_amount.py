"""amount on offers: how much an accepted add-on brought, when the price is known

Сравнение среднего чека с допродажей и без неё на малой выборке врёт (одна покупка против
десяти). Сумма принятого предложения отвечает на вопрос «сколько принесла допродажа» прямо.
NULL — цена в разговоре не прозвучала.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversation_offers", sa.Column("amount", sa.Numeric(10, 2), nullable=True), schema="analytics")


def downgrade() -> None:
    op.drop_column("conversation_offers", "amount", schema="analytics")
