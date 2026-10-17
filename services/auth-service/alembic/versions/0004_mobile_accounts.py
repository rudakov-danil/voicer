"""App-only employee invitations and revocable sessions."""
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

def upgrade():
    op.execute('''CREATE TABLE auth.mobile_accounts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id uuid NOT NULL,
        seller_id uuid NOT NULL, store_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
        invitation_hash text, invitation_expires_at timestamptz,
        refresh_hash text, refresh_expires_at timestamptz, session_version integer NOT NULL DEFAULT 0,
        created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, seller_id)
    )''')
    op.execute('CREATE UNIQUE INDEX mobile_invitation_hash ON auth.mobile_accounts(invitation_hash) WHERE invitation_hash IS NOT NULL')

def downgrade():
    op.execute('DROP TABLE auth.mobile_accounts')
