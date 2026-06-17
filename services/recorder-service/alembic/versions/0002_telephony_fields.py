"""telephony: call fields on recordings + telephony_settings

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recordings",
        sa.Column("source", sa.String(20), nullable=False, server_default="badge"),
        schema="recorder",
    )
    op.add_column("recordings", sa.Column("call_direction", sa.String(10), nullable=True), schema="recorder")
    op.add_column("recordings", sa.Column("client_phone", sa.String(32), nullable=True), schema="recorder")
    op.add_column("recordings", sa.Column("operator_phone", sa.String(32), nullable=True), schema="recorder")
    op.add_column("recordings", sa.Column("external_call_id", sa.String(128), nullable=True), schema="recorder")
    op.add_column("recordings", sa.Column("call_metadata", JSONB, nullable=True), schema="recorder")
    op.create_index("idx_recordings_source", "recordings", ["source"], schema="recorder")
    op.create_index("idx_recordings_client_phone", "recordings", ["client_phone"], schema="recorder")
    # Дедупликация вебхуков: одна АТС не должна создать дубль звонка в рамках организации
    op.create_index(
        "uq_recordings_org_external_call",
        "recordings",
        ["organization_id", "external_call_id"],
        unique=True,
        schema="recorder",
        postgresql_where=sa.text("external_call_id IS NOT NULL"),
    )

    op.create_table(
        "telephony_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("webhook_token", sa.String(64), nullable=False, unique=True),
        sa.Column("default_store_id", UUID(as_uuid=True), nullable=True),
        sa.Column("default_seller_id", UUID(as_uuid=True), nullable=True),
        sa.Column("operator_channel", sa.Integer, nullable=False, server_default="0"),
        sa.Column("operator_mapping", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="recorder",
    )


def downgrade() -> None:
    op.drop_table("telephony_settings", schema="recorder")
    op.drop_index("uq_recordings_org_external_call", table_name="recordings", schema="recorder")
    op.drop_index("idx_recordings_client_phone", table_name="recordings", schema="recorder")
    op.drop_index("idx_recordings_source", table_name="recordings", schema="recorder")
    op.drop_column("recordings", "call_metadata", schema="recorder")
    op.drop_column("recordings", "external_call_id", schema="recorder")
    op.drop_column("recordings", "operator_phone", schema="recorder")
    op.drop_column("recordings", "client_phone", schema="recorder")
    op.drop_column("recordings", "call_direction", schema="recorder")
    op.drop_column("recordings", "source", schema="recorder")
