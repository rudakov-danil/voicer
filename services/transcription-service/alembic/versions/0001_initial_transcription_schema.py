"""initial transcription schema

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
    op.execute("CREATE SCHEMA IF NOT EXISTS transcription")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "transcripts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("recording_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        sa.Column("full_text", sa.Text, nullable=False),
        sa.Column("language", sa.String(10), nullable=False, server_default="ru"),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="transcribed"),
        sa.Column("whisper_model", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="transcription",
    )
    op.create_index("idx_transcripts_recording", "transcripts", ["recording_id"], schema="transcription")
    op.create_index("idx_transcripts_org", "transcripts", ["organization_id"], schema="transcription")

    op.create_table(
        "transcript_segments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("transcript_id", UUID(as_uuid=True),
                  sa.ForeignKey("transcription.transcripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("speaker_role", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("start_ms", sa.Integer, nullable=False),
        sa.Column("end_ms", sa.Integer, nullable=False),
        sa.Column("segment_index", sa.Integer, nullable=False),
        sa.Column("avg_logprob", sa.Numeric(6, 4), nullable=True),
        schema="transcription",
    )
    op.create_index("idx_segments_transcript", "transcript_segments", ["transcript_id"], schema="transcription")
    op.create_index("idx_segments_speaker", "transcript_segments", ["transcript_id", "speaker_role"], schema="transcription")


def downgrade() -> None:
    op.drop_table("transcript_segments", schema="transcription")
    op.drop_table("transcripts", schema="transcription")
