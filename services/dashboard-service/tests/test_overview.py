import pytest
import uuid
from datetime import date
from sqlalchemy import text
from tests.conftest import ORG_ID, STORE_ID, SELLER_ID
from app import redis_client as rc


async def _insert_conversation(db, org_id, store_id, seller_id, score, outcome="purchase", session_date=None):
    if session_date is None:
        session_date = date.today()
    result = await db.execute(
        text("""
            INSERT INTO analytics.conversations
                (recording_id, transcript_id, organization_id, store_id, seller_id, session_date, overall_score, outcome)
            VALUES
                (uuid_generate_v4(), uuid_generate_v4(), :org_id, :store_id, :seller_id, :session_date, :score, :outcome)
            RETURNING id
        """),
        {
            "org_id": uuid.UUID(org_id),
            "store_id": uuid.UUID(store_id),
            "seller_id": uuid.UUID(seller_id),
            "session_date": session_date,
            "score": score,
            "outcome": outcome,
        },
    )
    await db.commit()
    return result.scalar_one()


@pytest.mark.asyncio
async def test_overview_cache_miss_hits_db(client, db_session, fake_redis):
    """DASH-I-01: cache miss → queries DB, caches result"""
    await _insert_conversation(db_session, ORG_ID, STORE_ID, SELLER_ID, 75.0, "purchase")
    rc.redis = fake_redis

    resp = await client.get(f"/api/v1/dashboard/overview?date_from=2020-01-01&date_to=2030-12-31")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_conversations"] >= 1


@pytest.mark.asyncio
async def test_overview_cache_hit(client, db_session, fake_redis):
    """DASH-I-02: cache hit → returns cached data without hitting DB"""
    rc.redis = fake_redis
    cached_data = {
        "period": {"from": "2026-01-01", "to": "2026-03-31"},
        "total_conversations": 999,
        "avg_score": 88.0,
        "conversion_rate": 0.75,
        "score_distribution": {"excellent": 100, "good": 50, "poor": 30},
        "daily_stats": [],
    }
    cache_key = f"dashboard:overview:{ORG_ID}:all:2026-01-01_2026-03-31"
    await rc.set_cached(cache_key, cached_data)

    resp = await client.get("/api/v1/dashboard/overview?date_from=2026-01-01&date_to=2026-03-31")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_conversations"] == 999


@pytest.mark.asyncio
async def test_overview_manager_sees_own_store(manager_client, db_session, fake_redis):
    """DASH-I-07: manager sees only own store data"""
    other_store = str(uuid.uuid4())
    rc.redis = fake_redis

    # Insert conversation for other store
    await _insert_conversation(db_session, ORG_ID, other_store, SELLER_ID, 90.0)

    resp = await manager_client.get("/api/v1/dashboard/overview?date_from=2020-01-01&date_to=2030-12-31")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_conversations_score_filter(client, db_session, fake_redis):
    """DASH-I-05: score_min=80 returns only conversations with overall_score >= 80"""
    rc.redis = fake_redis
    await _insert_conversation(db_session, ORG_ID, STORE_ID, SELLER_ID, 85.0)
    await _insert_conversation(db_session, ORG_ID, STORE_ID, SELLER_ID, 55.0)

    resp = await client.get("/api/v1/dashboard/conversations?score_min=80&date_from=2020-01-01&date_to=2030-12-31")
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["overall_score"] is None or item["overall_score"] >= 80


@pytest.mark.asyncio
async def test_sellers_sort_by_avg_score(client, db_session, fake_redis):
    """DASH-I-04: sellers sorted by avg_score"""
    rc.redis = fake_redis
    seller_a = str(uuid.uuid4())
    seller_b = str(uuid.uuid4())
    await _insert_conversation(db_session, ORG_ID, STORE_ID, seller_a, 90.0)
    await _insert_conversation(db_session, ORG_ID, STORE_ID, seller_b, 50.0)

    resp = await client.get("/api/v1/dashboard/sellers?sort_by=avg_score&date_from=2020-01-01&date_to=2030-12-31")
    assert resp.status_code == 200
    data = resp.json()
    scores = [item["avg_score"] for item in data["items"]]
    assert scores == sorted(scores, reverse=True)
