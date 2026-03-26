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
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")

    op.create_table(
        'conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recording_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('transcript_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('overall_score', sa.Numeric(8, 2), nullable=True),
        sa.Column('outcome', sa.String(20), nullable=False),
        sa.Column('outcome_confidence', sa.Numeric(3, 2), nullable=True),
        sa.Column('topic', sa.String(500), nullable=True),
        sa.Column('sentiment_avg', sa.Numeric(4, 3), nullable=True),
        sa.Column('analyzed_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('llm_model', sa.String(100), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('recording_id'),
        schema='analytics',
    )
    op.create_index('idx_conversations_org', 'conversations', ['organization_id'], schema='analytics')
    op.create_index('idx_conversations_store', 'conversations', ['store_id'], schema='analytics')
    op.create_index('idx_conversations_seller', 'conversations', ['seller_id'], schema='analytics')
    op.create_index('idx_conversations_date', 'conversations', ['session_date'], schema='analytics')
    op.create_index('idx_conversations_score', 'conversations', ['overall_score'], schema='analytics')

    op.create_table(
        'conversation_script_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('script_template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('script_name', sa.String(255), nullable=False),
        sa.Column('was_applied', sa.Boolean(), nullable=False),
        sa.Column('script_score', sa.Numeric(5, 2), nullable=True),
        sa.Column('violations', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column('skip_reason', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['conversation_id'], ['analytics.conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('conversation_id', 'script_template_id'),
        schema='analytics',
    )
    op.create_index('idx_script_results_conversation', 'conversation_script_results', ['conversation_id'], schema='analytics')

    op.create_table(
        'conversation_scores',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('script_template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('script_step_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('step_name', sa.String(255), nullable=False),
        sa.Column('step_weight', sa.Numeric(4, 3), nullable=False),
        sa.Column('score', sa.Numeric(5, 2), nullable=False),
        sa.Column('evidence_text', sa.Text(), nullable=True),
        sa.Column('step_detected', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['analytics.conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('conversation_id', 'script_step_id'),
        schema='analytics',
    )
    op.create_index('idx_conv_scores_conversation', 'conversation_scores', ['conversation_id'], schema='analytics')
    op.create_index('idx_conv_scores_template', 'conversation_scores', ['script_template_id'], schema='analytics')

    op.create_table(
        'objections',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('is_resolved', sa.Boolean(), nullable=False),
        sa.Column('resolution_technique', sa.Text(), nullable=True),
        sa.Column('raw_text', sa.Text(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['analytics.conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='analytics',
    )
    op.create_index('idx_objections_conversation', 'objections', ['conversation_id'], schema='analytics')


def downgrade() -> None:
    op.drop_table('objections', schema='analytics')
    op.drop_table('conversation_scores', schema='analytics')
    op.drop_table('conversation_script_results', schema='analytics')
    op.drop_table('conversations', schema='analytics')
    op.execute("DROP SCHEMA IF EXISTS analytics")
