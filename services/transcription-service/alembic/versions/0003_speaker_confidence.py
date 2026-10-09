"""add speaker_confidence from Deepgram diarization to transcript_segments

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Средняя уверенность Deepgram в спикере по словам сегмента (0..1).
    # NULL — Deepgram её не прислал или сегмент создан раньше.
    op.add_column(
        "transcript_segments",
        sa.Column("speaker_confidence", sa.Numeric(4, 3), nullable=True),
        schema="transcription",
    )


def downgrade() -> None:
    op.drop_column("transcript_segments", "speaker_confidence", schema="transcription")
