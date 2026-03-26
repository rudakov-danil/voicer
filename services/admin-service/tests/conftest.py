import asyncio
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.database import Base, get_db
from app.models import Store, Seller, Device


MOCK_DIRECTOR = {
    "sub": "00000000-0000-0000-0000-000000000001",
    "organization_id": "00000000-0000-0000-0000-000000000010",
    "role": "director",
    "store_id": None,
    "rop_stores": [],
}

MOCK_MANAGER = {
    "sub": "00000000-0000-0000-0000-000000000002",
    "organization_id": "00000000-0000-0000-0000-000000000010",
    "role": "manager",
    "store_id": None,  # will be set after store creation
    "rop_stores": [],
}


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_container):
    url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg")
    engine = create_async_engine(url, echo=False)

    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS admin_schema"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def director_client(db_session):
    """Client with mocked director auth."""
    from app.dependencies import get_current_user

    async def override_get_db():
        yield db_session

    async def mock_director():
        return MOCK_DIRECTOR

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = mock_director

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_store(db_session) -> Store:
    store = Store(
        organization_id="00000000-0000-0000-0000-000000000010",
        name="Test Store",
        address="ул. Тестовая, 1",
    )
    db_session.add(store)
    await db_session.commit()
    await db_session.refresh(store)
    return store


@pytest_asyncio.fixture
async def test_seller(db_session, test_store) -> Seller:
    seller = Seller(
        organization_id="00000000-0000-0000-0000-000000000010",
        store_id=test_store.id,
        first_name="Иван",
        last_name="Петров",
    )
    db_session.add(seller)
    await db_session.commit()
    await db_session.refresh(seller)
    return seller
