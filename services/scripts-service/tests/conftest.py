import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from testcontainers.postgres import PostgresContainer
from app.main import app
from app.database import Base, get_db

TEST_ORG_ID = str(uuid.uuid4())
TEST_USER_ID = str(uuid.uuid4())
TEST_MANAGER_ID = str(uuid.uuid4())
OTHER_ORG_ID = str(uuid.uuid4())

DIRECTOR_PAYLOAD = {
    "sub": TEST_USER_ID,
    "organization_id": TEST_ORG_ID,
    "role": "director",
    "store_id": None,
    "rop_stores": [],
}

MANAGER_PAYLOAD = {
    "sub": TEST_MANAGER_ID,
    "organization_id": TEST_ORG_ID,
    "role": "manager",
    "store_id": str(uuid.uuid4()),
    "rop_stores": [],
}

OTHER_ORG_PAYLOAD = {
    "sub": str(uuid.uuid4()),
    "organization_id": OTHER_ORG_ID,
    "role": "director",
    "store_id": None,
    "rop_stores": [],
}


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_container):
    url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg")
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.execute(__import__("sqlalchemy").text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(__import__("sqlalchemy").text("CREATE SCHEMA IF NOT EXISTS scripts"))
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
        await session.rollback()


def make_client(payload: dict):
    """Create a test client with mocked auth returning given payload."""
    async def mock_get_current_user():
        return payload

    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = mock_get_current_user
    return payload


@pytest_asyncio.fixture
async def director_client(db_session):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: DIRECTOR_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, DIRECTOR_PAYLOAD
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def manager_client(db_session):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: MANAGER_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, MANAGER_PAYLOAD
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def other_org_client(db_session):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: OTHER_ORG_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, OTHER_ORG_PAYLOAD
    app.dependency_overrides.clear()


VALID_STEPS = [
    {"name": "Greeting", "weight": 0.15, "is_required": True, "step_order": 1},
    {"name": "Presentation", "weight": 0.50, "is_required": True, "step_order": 2},
    {"name": "Close", "weight": 0.35, "is_required": True, "step_order": 3},
]
