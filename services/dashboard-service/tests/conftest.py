import pytest
import pytest_asyncio
import uuid
from datetime import date
from httpx import AsyncClient, ASGITransport
from fakeredis.aioredis import FakeRedis
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from testcontainers.postgres import PostgresContainer
from app.main import app
from app.database import Base, get_db
from app import redis_client as rc

ORG_ID = str(uuid.uuid4())
STORE_ID = str(uuid.uuid4())
SELLER_ID = str(uuid.uuid4())

DIRECTOR_PAYLOAD = {
    "sub": str(uuid.uuid4()),
    "organization_id": ORG_ID,
    "role": "director",
    "store_id": None,
}

MANAGER_PAYLOAD = {
    "sub": str(uuid.uuid4()),
    "organization_id": ORG_ID,
    "role": "manager",
    "store_id": STORE_ID,
}


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_container):
    import sqlalchemy
    url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg")
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.execute(sqlalchemy.text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(sqlalchemy.text("CREATE SCHEMA IF NOT EXISTS analytics"))
        await conn.execute(sqlalchemy.text("CREATE SCHEMA IF NOT EXISTS admin_schema"))
        # Create analytics tables for tests
        await conn.execute(sqlalchemy.text("""
            CREATE TABLE IF NOT EXISTS analytics.conversations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                recording_id UUID NOT NULL UNIQUE,
                transcript_id UUID NOT NULL,
                organization_id UUID NOT NULL,
                store_id UUID NOT NULL,
                seller_id UUID NOT NULL,
                session_date DATE NOT NULL,
                overall_score NUMERIC(5,2),
                outcome VARCHAR(20) NOT NULL,
                outcome_confidence NUMERIC(3,2),
                topic VARCHAR(500),
                sentiment_avg NUMERIC(4,3),
                analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                llm_model VARCHAR(100),
                status VARCHAR(20) NOT NULL DEFAULT 'analyzed'
            )
        """))
        await conn.execute(sqlalchemy.text("""
            CREATE TABLE IF NOT EXISTS analytics.conversation_script_results (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                conversation_id UUID NOT NULL REFERENCES analytics.conversations(id) ON DELETE CASCADE,
                script_template_id UUID NOT NULL,
                script_name VARCHAR(255) NOT NULL,
                was_applied BOOLEAN NOT NULL DEFAULT true,
                script_score NUMERIC(5,2),
                violations TEXT[] NOT NULL DEFAULT '{}',
                skip_reason TEXT,
                UNIQUE(conversation_id, script_template_id)
            )
        """))
        await conn.execute(sqlalchemy.text("""
            CREATE TABLE IF NOT EXISTS analytics.conversation_scores (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                conversation_id UUID NOT NULL REFERENCES analytics.conversations(id) ON DELETE CASCADE,
                script_template_id UUID NOT NULL,
                script_step_id UUID NOT NULL,
                step_name VARCHAR(255) NOT NULL,
                step_weight NUMERIC(4,3) NOT NULL,
                score NUMERIC(5,2) NOT NULL,
                evidence_text TEXT,
                step_detected BOOLEAN NOT NULL DEFAULT false,
                UNIQUE(conversation_id, script_step_id)
            )
        """))
        await conn.execute(sqlalchemy.text("""
            CREATE TABLE IF NOT EXISTS admin_schema.alert_settings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_id UUID NOT NULL,
                store_id UUID,
                score_threshold NUMERIC(5,2) NOT NULL DEFAULT 60.0,
                email_recipients TEXT[] NOT NULL DEFAULT '{}',
                is_active BOOLEAN NOT NULL DEFAULT false,
                no_activity_hours INTEGER NOT NULL DEFAULT 24
            )
        """))
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
        await session.rollback()


@pytest.fixture
def fake_redis():
    return FakeRedis(decode_responses=True)


@pytest_asyncio.fixture
async def client(db_session, fake_redis):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: DIRECTOR_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    rc.redis = fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def manager_client(db_session, fake_redis):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: MANAGER_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    rc.redis = fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
