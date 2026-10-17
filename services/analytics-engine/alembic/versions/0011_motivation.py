"""Versioned coin rules, immutable source snapshots, manager decisions and audience caches."""
from alembic import op

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

def upgrade():
    op.execute('''CREATE TABLE analytics.coin_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id uuid NOT NULL,
        store_id uuid, rules jsonb NOT NULL, effective_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL
    )''')
    op.execute('CREATE INDEX coin_rules_scope ON analytics.coin_rules(organization_id,store_id,effective_at)')
    op.execute('''CREATE TABLE analytics.coin_sources (
        recording_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now()
    )''')
    op.execute('''CREATE TABLE analytics.coin_events (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id uuid NOT NULL,
        store_id uuid NOT NULL, seller_id uuid NOT NULL, recording_id uuid NOT NULL,
        source_order integer NOT NULL, session_date date NOT NULL,
        item text NOT NULL, category text NOT NULL, quote text NOT NULL, customer_quote text NOT NULL,
        rule_id uuid NOT NULL REFERENCES analytics.coin_rules(id), rule_label text NOT NULL,
        coins integer NOT NULL CHECK(coins > 0 AND coins <= 1000),
        status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','voided')),
        decided_by uuid, decided_at timestamptz, reason text,
        voided_by uuid, voided_at timestamptz, void_reason text,
        created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recording_id,source_order)
    )''')
    op.execute('CREATE INDEX coin_events_seller ON analytics.coin_events(organization_id,seller_id,session_date)')
    op.execute("ALTER TABLE analytics.seller_tips ADD COLUMN audience text NOT NULL DEFAULT 'employee'")
    op.execute('ALTER TABLE analytics.seller_tips DROP CONSTRAINT uq_seller_tips_day')
    op.execute('ALTER TABLE analytics.seller_tips ADD CONSTRAINT uq_seller_tips_audience UNIQUE(seller_id,tip_date,audience)')

def downgrade():
    op.execute("DELETE FROM analytics.seller_tips WHERE audience <> 'employee'")
    op.execute('ALTER TABLE analytics.seller_tips DROP CONSTRAINT uq_seller_tips_audience')
    op.execute('ALTER TABLE analytics.seller_tips DROP COLUMN audience')
    op.execute('ALTER TABLE analytics.seller_tips ADD CONSTRAINT uq_seller_tips_day UNIQUE(seller_id,tip_date)')
    op.execute('DROP TABLE analytics.coin_events, analytics.coin_sources, analytics.coin_rules')
