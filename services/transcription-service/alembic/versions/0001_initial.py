"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS transcription")

    op.create_table(
        'transcripts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recording_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('full_text', sa.Text(), nullable=False),
        sa.Column('language', sa.String(10), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('whisper_model', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('recording_id'),
        schema='transcription',
    )
    op.create_index('ix_transcripts_org', 'transcripts', ['organization_id'], schema='transcription')
    op.create_index('ix_transcripts_seller', 'transcripts', ['seller_id'], schema='transcription')
    op.create_index('ix_transcripts_status', 'transcripts', ['status'], schema='transcription')

    op.create_table(
        'transcript_segments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('transcript_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('speaker_role', sa.String(20), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('start_ms', sa.Integer(), nullable=False),
        sa.Column('end_ms', sa.Integer(), nullable=False),
        sa.Column('segment_index', sa.Integer(), nullable=False),
        sa.Column('avg_logprob', sa.Numeric(6, 4), nullable=True),
        sa.ForeignKeyConstraint(['transcript_id'], ['transcription.transcripts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='transcription',
    )
    op.create_index('ix_segments_transcript', 'transcript_segments', ['transcript_id'], schema='transcription')


def downgrade() -> None:
    op.drop_table('transcript_segments', schema='transcription')
    op.drop_table('transcripts', schema='transcription')
    op.execute("DROP SCHEMA IF EXISTS transcription")
