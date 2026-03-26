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
    op.execute("CREATE SCHEMA IF NOT EXISTS admin_schema")

    op.create_table(
        'stores',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='admin_schema',
    )
    op.create_index('ix_admin_stores_org', 'stores', ['organization_id'], schema='admin_schema')

    op.create_table(
        'sellers',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=False),
        sa.Column('last_name', sa.String(100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['admin_schema.stores.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        schema='admin_schema',
    )
    op.create_index('ix_admin_sellers_store', 'sellers', ['store_id'], schema='admin_schema')
    op.create_index('ix_admin_sellers_org', 'sellers', ['organization_id'], schema='admin_schema')

    op.create_table(
        'devices',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('serial_number', sa.String(100), nullable=False),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['admin_schema.stores.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['seller_id'], ['admin_schema.sellers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('serial_number'),
        schema='admin_schema',
    )

    op.create_table(
        'privacy_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('retention_days', sa.Integer(), nullable=False),
        sa.Column('anonymize_transcripts', sa.Boolean(), nullable=False),
        sa.Column('consent_required', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['admin_schema.stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='admin_schema',
    )

    op.create_table(
        'alert_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('score_threshold', sa.Integer(), nullable=False),
        sa.Column('no_activity_hours', sa.Integer(), nullable=True),
        sa.Column('email_recipients', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['admin_schema.stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='admin_schema',
    )

    op.create_table(
        'store_licenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('granted_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['admin_schema.stores.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        schema='admin_schema',
    )


def downgrade() -> None:
    op.drop_table('store_licenses', schema='admin_schema')
    op.drop_table('alert_settings', schema='admin_schema')
    op.drop_table('privacy_settings', schema='admin_schema')
    op.drop_table('devices', schema='admin_schema')
    op.drop_table('sellers', schema='admin_schema')
    op.drop_table('stores', schema='admin_schema')
    op.execute("DROP SCHEMA IF EXISTS admin_schema")
