"""upsell/cross-sell rules: store_id -> store_ids[] + seller_ids[]

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def _upgrade_table(table: str) -> None:
    op.add_column(
        table,
        sa.Column("store_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),
        schema="scripts",
    )
    op.add_column(
        table,
        sa.Column("seller_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),
        schema="scripts",
    )
    # Бэкфилл: store_id (одиночный) → store_ids: NULL → пустой массив (все магазины),
    # иначе → массив из одного магазина.
    op.execute(f"""
        UPDATE scripts.{table}
        SET store_ids = CASE WHEN store_id IS NULL THEN '{{}}'::uuid[] ELSE ARRAY[store_id] END
    """)
    op.drop_index(f"idx_{table}_org_store", table_name=table, schema="scripts")
    op.drop_column(table, "store_id", schema="scripts")
    op.create_index(f"idx_{table}_org", table, ["organization_id"], schema="scripts")


def _downgrade_table(table: str) -> None:
    op.add_column(table, sa.Column("store_id", UUID(as_uuid=True), nullable=True), schema="scripts")
    op.execute(f"""
        UPDATE scripts.{table}
        SET store_id = CASE WHEN cardinality(store_ids) > 0 THEN store_ids[1] ELSE NULL END
    """)
    op.drop_index(f"idx_{table}_org", table_name=table, schema="scripts")
    op.create_index(f"idx_{table}_org_store", table, ["organization_id", "store_id"], schema="scripts")
    op.drop_column(table, "seller_ids", schema="scripts")
    op.drop_column(table, "store_ids", schema="scripts")


def upgrade() -> None:
    _upgrade_table("upsell_rules")
    _upgrade_table("cross_sell_rules")


def downgrade() -> None:
    _downgrade_table("upsell_rules")
    _downgrade_table("cross_sell_rules")
