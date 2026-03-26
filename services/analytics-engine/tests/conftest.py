import pytest
import pytest_asyncio
import uuid
from datetime import date
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from testcontainers.postgres import PostgresContainer
from app.main import app
from app.database import Base, get_db

ORG_ID = str(uuid.uuid4())
STORE_ID = str(uuid.uuid4())
SELLER_ID = str(uuid.uuid4())
RECORDING_ID = str(uuid.uuid4())
TRANSCRIPT_ID = str(uuid.uuid4())

DIRECTOR_PAYLOAD = {
    "sub": str(uuid.uuid4()),
    "organization_id": ORG_ID,
    "role": "director",
    "store_id": None,
}

OTHER_ORG_PAYLOAD = {
    "sub": str(uuid.uuid4()),
    "organization_id": str(uuid.uuid4()),
    "role": "director",
    "store_id": None,
}

SAMPLE_SEGMENTS = [
    {"start_ms": 0, "end_ms": 5000, "text": "Добрый день, меня зовут Иван!", "speaker_role": "seller"},
    {"start_ms": 5000, "end_ms": 10000, "text": "Здравствуйте, хочу купить телефон", "speaker_role": "customer"},
    {"start_ms": 10000, "end_ms": 15000, "text": "Хотите взять чехол?", "speaker_role": "seller"},
]

SAMPLE_SCRIPTS = [
    {
        "id": str(uuid.uuid4()),
        "name": "Базовый скрипт",
        "is_mandatory": True,
        "context_description": None,
        "steps": [
            {"id": str(uuid.uuid4()), "name": "Приветствие", "weight": 0.40, "step_order": 1, "description": ""},
            {"id": str(uuid.uuid4()), "name": "Закрытие", "weight": 0.60, "step_order": 2, "description": ""},
        ],
    }
]

SAMPLE_SCRIPTS_TWO = [
    {
        "id": str(uuid.uuid4()),
        "name": "Скрипт 1",
        "is_mandatory": True,
        "context_description": None,
        "steps": [
            {"id": str(uuid.uuid4()), "name": "Шаг 1", "weight": 1.0, "step_order": 1, "description": ""},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Скрипт 2",
        "is_mandatory": True,
        "context_description": None,
        "steps": [
            {"id": str(uuid.uuid4()), "name": "Шаг А", "weight": 1.0, "step_order": 1, "description": ""},
        ],
    },
]


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
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: DIRECTOR_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def other_org_client(db_session):
    from app.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: OTHER_ORG_PAYLOAD
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def make_llm_response(content: str):
    """Create mock LLM response object."""
    mock = MagicMock()
    mock.choices[0].message.content = content
    return mock
