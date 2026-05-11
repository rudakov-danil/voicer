"""add speaker_id from Deepgram diarization to transcript_segments

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-11 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # speaker_id: ID кластера говорящего от Deepgram diarization (0, 1, 2, ...)
    # NULL означает что Deepgram не определил спикера или сегмент создан до включения diarize.
    op.add_column(
        "transcript_segments",
        sa.Column("speaker_id", sa.Integer, nullable=True),
        schema="transcription",
    )
    op.create_index(
        "idx_segments_speaker_id",
        "transcript_segments",
        ["transcript_id", "speaker_id"],
        schema="transcription",
    )


def downgrade() -> None:
    op.drop_index("idx_segments_speaker_id", table_name="transcript_segments", schema="transcription")
    op.drop_column("transcript_segments", "speaker_id", schema="transcription")
