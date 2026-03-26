"""initial analytics schema

Revision ID: 0001
Revises:
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("recording_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("transcript_id", UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("overall_score", sa.Numeric(5, 2)),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("outcome_confidence", sa.Numeric(3, 2)),
        sa.Column("topic", sa.String(500)),
        sa.Column("sentiment_avg", sa.Numeric(4, 3)),
        sa.Column("analyzed_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("llm_model", sa.String(100)),
        sa.Column("status", sa.String(20), nullable=False, server_default="analyzed"),
        schema="analytics",
    )
    op.create_index("idx_conversations_org", "conversations", ["organization_id"], schema="analytics")
    op.create_index("idx_conversations_store", "conversations", ["store_id"], schema="analytics")
    op.create_index("idx_conversations_seller", "conversations", ["seller_id"], schema="analytics")
    op.create_index("idx_conversations_date", "conversations", ["session_date"], schema="analytics")
    op.create_index("idx_conversations_score", "conversations", ["overall_score"], schema="analytics")

    op.create_table(
        "conversation_script_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("conversation_id", UUID(as_uuid=True),
                  sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("script_template_id", UUID(as_uuid=True), nullable=False),
        sa.Column("script_name", sa.String(255), nullable=False),
        sa.Column("was_applied", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("script_score", sa.Numeric(5, 2)),
        sa.Column("violations", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("skip_reason", sa.Text),
        sa.UniqueConstraint("conversation_id", "script_template_id"),
        schema="analytics",
    )
    op.create_index("idx_script_results_conversation", "conversation_script_results", ["conversation_id"], schema="analytics")

    op.create_table(
        "conversation_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("conversation_id", UUID(as_uuid=True),
                  sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("script_template_id", UUID(as_uuid=True), nullable=False),
        sa.Column("script_step_id", UUID(as_uuid=True), nullable=False),
        sa.Column("step_name", sa.String(255), nullable=False),
        sa.Column("step_weight", sa.Numeric(4, 3), nullable=False),
        sa.Column("score", sa.Numeric(5, 2), nullable=False),
        sa.Column("evidence_text", sa.Text),
        sa.Column("step_detected", sa.Boolean, nullable=False, server_default="false"),
        sa.UniqueConstraint("conversation_id", "script_step_id"),
        schema="analytics",
    )
    op.create_index("idx_conv_scores_conversation", "conversation_scores", ["conversation_id"], schema="analytics")
    op.create_index("idx_conv_scores_template", "conversation_scores", ["script_template_id"], schema="analytics")

    op.create_table(
        "objections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("conversation_id", UUID(as_uuid=True),
                  sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("is_resolved", sa.Boolean, nullable=False),
        sa.Column("resolution_technique", sa.Text),
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        schema="analytics",
    )
    op.create_index("idx_objections_conversation", "objections", ["conversation_id"], schema="analytics")


def downgrade() -> None:
    op.drop_table("objections", schema="analytics")
    op.drop_table("conversation_scores", schema="analytics")
    op.drop_table("conversation_script_results", schema="analytics")
    op.drop_table("conversations", schema="analytics")
    op.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
