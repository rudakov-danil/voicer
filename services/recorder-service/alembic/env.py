import asyncio
from logging.config import fileConfig
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.models import Base
from app.config import settings

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
target_metadata = Base.metadata


VERSION_TABLE_SCHEMA = "recorder"


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"},
                      version_table_schema=VERSION_TABLE_SCHEMA, include_schemas=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {VERSION_TABLE_SCHEMA}"))
    connection.commit()
    context.configure(connection=connection, target_metadata=target_metadata,
                      version_table_schema=VERSION_TABLE_SCHEMA, include_schemas=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
