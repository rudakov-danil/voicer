"""script template short_name (для компактного отображения)

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "script_templates",
        sa.Column("short_name", sa.String(60), nullable=True),
        schema="scripts",
    )

    # Бэкфилл: убрать "Стандартный скрипт продаж" / "Скрипт продаж" из начала name.
    # Просто: regex-replace на уровне SQL. Не идеально, но лучше, чем пусто.
    op.execute("""
        UPDATE scripts.script_templates
        SET short_name = INITCAP(BTRIM(
            REGEXP_REPLACE(
                name,
                '^(стандартный |базовый |улучшенный )?(скрипт |скрипты )?(продаж|продажи|продажа) ?',
                '',
                'i'
            )
        ))
        WHERE short_name IS NULL OR short_name = ''
    """)
    # Если после очистки пусто — оставим первые 30 символов оригинала
    op.execute("""
        UPDATE scripts.script_templates
        SET short_name = LEFT(name, 30)
        WHERE short_name IS NULL OR short_name = ''
    """)


def downgrade() -> None:
    op.drop_column("script_templates", "short_name", schema="scripts")
