import asyncio
import io
import wave
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.database import Base, get_db
from app.models import Transcript, TranscriptSegment


def make_wav_bytes(duration_ms: int = 1000, sample_rate: int = 16000) -> bytes:
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


ORG_ID = "bbbbbbbb-0000-0000-0000-000000000001"
STORE_ID = "cccccccc-0000-0000-0000-000000000001"
SELLER_ID = "dddddddd-0000-0000-0000-000000000001"

MOCK_USER = {
    "sub": "eeeeeeee-0000-0000-0000-000000000001",
    "organization_id": ORG_ID,
    "role": "director",
    "store_id": None,
    "rop_stores": [],
}

MOCK_WHISPER_RESULT = {
    "text": "Здравствуйте чем могу помочь Меня интересует холодильник До свидания",
    "language": "ru",
    "segments": [
        {"start": 0.0, "end": 2.5, "text": "Здравствуйте, чем могу помочь?", "avg_logprob": -0.2},
        {"start": 3.1, "end": 5.8, "text": "Меня интересует холодильник.", "avg_logprob": -0.15},
        {"start": 6.0, "end": 7.5, "text": "До свидания.", "avg_logprob": -0.1},
    ],
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
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS transcription"))
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
    from app.dependencies import get_current_user

    async def override_get_db():
        yield db_session

    async def mock_user():
        return MOCK_USER

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_transcript(db_session) -> Transcript:
    recording_id = uuid.uuid4()
    transcript = Transcript(
        recording_id=recording_id,
        organization_id=ORG_ID,
        store_id=STORE_ID,
        seller_id=SELLER_ID,
        full_text="Здравствуйте, чем могу помочь? Меня интересует холодильник.",
        language="ru",
        duration_seconds=245,
        status="diarized",
        whisper_model="whisper-large-v3",
    )
    db_session.add(transcript)
    await db_session.flush()

    segments = [
        TranscriptSegment(transcript_id=transcript.id, speaker_role="seller",
                          text="Здравствуйте, чем могу помочь?", start_ms=0, end_ms=2500, segment_index=0),
        TranscriptSegment(transcript_id=transcript.id, speaker_role="customer",
                          text="Меня интересует холодильник.", start_ms=3100, end_ms=5800, segment_index=1),
    ]
    for s in segments:
        db_session.add(s)
    await db_session.commit()
    await db_session.refresh(transcript)
    return transcript
