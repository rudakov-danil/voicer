"""initial recorder schema

Revision ID: 0001
Revises:
Create Date: 2026-03-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS recorder")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "recordings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("audio_path", sa.String(500), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="recorder",
    )
    op.create_index("idx_recordings_org", "recordings", ["organization_id"], schema="recorder")
    op.create_index("idx_recordings_store", "recordings", ["store_id"], schema="recorder")
    op.create_index("idx_recordings_seller", "recordings", ["seller_id"], schema="recorder")
    op.create_index("idx_recordings_date", "recordings", ["session_date"], schema="recorder")
    op.create_index("idx_recordings_status", "recordings", ["status"], schema="recorder")

    op.create_table(
        "audio_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("duration_ms", sa.Integer, nullable=False),
        sa.Column("audio_path", sa.String(500), nullable=False),
        sa.Column("timestamp_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timestamp_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("stitched", sa.Boolean, nullable=False, server_default="false"),
        sa.UniqueConstraint("device_id", "session_date", "chunk_index", name="uq_chunk_device_date_index"),
        schema="recorder",
    )
    op.create_index("idx_chunks_device_date", "audio_chunks", ["device_id", "session_date"], schema="recorder")


def downgrade() -> None:
    op.drop_table("audio_chunks", schema="recorder")
    op.drop_table("recordings", schema="recorder")
