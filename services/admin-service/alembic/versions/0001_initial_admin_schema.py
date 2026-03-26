"""initial admin schema

Revision ID: 0001
Revises:
Create Date: 2026-03-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS admin_schema")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "stores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("organization_id", "name", name="uq_stores_org_name"),
        schema="admin_schema",
    )
    op.create_index("idx_stores_org", "stores", ["organization_id"], schema="admin_schema")

    op.create_table(
        "sellers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="admin_schema",
    )
    op.create_index("idx_sellers_store", "sellers", ["store_id"], schema="admin_schema")
    op.create_index("idx_sellers_org", "sellers", ["organization_id"], schema="admin_schema")

    op.create_table(
        "devices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.sellers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=False, unique=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="admin_schema",
    )
    op.create_index("idx_devices_store", "devices", ["store_id"], schema="admin_schema")
    op.create_index("idx_devices_serial", "devices", ["serial_number"], schema="admin_schema")

    op.create_table(
        "privacy_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True),
        sa.Column("retention_days", sa.Integer, nullable=False, server_default="90"),
        sa.Column("anonymize_transcripts", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("consent_required", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("organization_id", "store_id", name="uq_privacy_org_store"),
        schema="admin_schema",
    )

    op.create_table(
        "alert_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True),
        sa.Column("score_threshold", sa.Integer, nullable=False, server_default="60"),
        sa.Column("no_activity_hours", sa.Integer, nullable=True, server_default="4"),
        sa.Column("email_recipients", ARRAY(sa.Text), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="admin_schema",
    )
    op.create_index("idx_alert_settings_org", "alert_settings", ["organization_id"], schema="admin_schema")

    op.create_table(
        "store_licenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), sa.ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("granted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="admin_schema",
    )


def downgrade() -> None:
    op.drop_table("store_licenses", schema="admin_schema")
    op.drop_table("alert_settings", schema="admin_schema")
    op.drop_table("privacy_settings", schema="admin_schema")
    op.drop_table("devices", schema="admin_schema")
    op.drop_table("sellers", schema="admin_schema")
    op.drop_table("stores", schema="admin_schema")
