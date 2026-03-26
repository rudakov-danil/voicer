import asyncio
import io
import wave
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.database import Base, get_db
from app.models import AudioChunk, Recording


def make_wav_bytes(duration_ms: int = 500, sample_rate: int = 16000) -> bytes:
    """Create a minimal valid WAV file in memory."""
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


MOCK_DEVICE = {
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "organization_id": "bbbbbbbb-0000-0000-0000-000000000001",
    "store_id": "cccccccc-0000-0000-0000-000000000001",
    "seller_id": "dddddddd-0000-0000-0000-000000000001",
    "serial_number": "VIQ-TEST-001",
    "is_active": True,
}

MOCK_USER = {
    "sub": "eeeeeeee-0000-0000-0000-000000000001",
    "organization_id": "bbbbbbbb-0000-0000-0000-000000000001",
    "role": "director",
    "store_id": None,
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
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS recorder"))
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
