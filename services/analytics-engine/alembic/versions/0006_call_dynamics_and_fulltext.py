"""dynamics metrics on conversations + block_results for fulltext scripts

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("talk_ratio", sa.Numeric(4, 3), nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("interruptions_count", sa.Integer, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("longest_monologue_seconds", sa.Integer, nullable=True), schema="analytics")
    op.add_column("conversations", sa.Column("silence_ratio", sa.Numeric(4, 3), nullable=True), schema="analytics")
    op.add_column("conversation_script_results", sa.Column("block_results", JSONB, nullable=True), schema="analytics")


def downgrade() -> None:
    op.drop_column("conversation_script_results", "block_results", schema="analytics")
    op.drop_column("conversations", "silence_ratio", schema="analytics")
    op.drop_column("conversations", "longest_monologue_seconds", schema="analytics")
    op.drop_column("conversations", "interruptions_count", schema="analytics")
    op.drop_column("conversations", "talk_ratio", schema="analytics")
