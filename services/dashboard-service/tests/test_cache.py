import pytest
import uuid
from app import redis_client as rc


@pytest.mark.asyncio
async def test_get_cached_miss(fake_redis):
    """DASH-U-02: get_cached returns None for non-existent key"""
    rc.redis = fake_redis
    result = await rc.get_cached("nonexistent:key")
    assert result is None


@pytest.mark.asyncio
async def test_set_and_get_cached(fake_redis):
    """DASH-U-03: set_cached / get_cached round-trip"""
    rc.redis = fake_redis
    data = {"total": 42, "avg_score": 75.5, "nested": {"a": 1}}
    await rc.set_cached("test:key", data, ttl_seconds=60)
    result = await rc.get_cached("test:key")
    assert result == data


@pytest.mark.asyncio
async def test_invalidate_store_cache(fake_redis):
    """DASH-U-01: invalidate_store_cache deletes matching keys"""
    rc.redis = fake_redis
    org = str(uuid.uuid4())
    store = str(uuid.uuid4())

    await rc.set_cached(f"dashboard:overview:{org}:{store}:2026-03-01_2026-03-18", {"x": 1})
    await rc.set_cached(f"dashboard:sellers:{org}:{store}:2026-03-01_2026-03-18", {"y": 2})
    await rc.set_cached(f"dashboard:overview:{org}:other_store:2026-03-01_2026-03-18", {"z": 3})

    await rc.invalidate_store_cache(org, store)

    assert await rc.get_cached(f"dashboard:overview:{org}:{store}:2026-03-01_2026-03-18") is None
    assert await rc.get_cached(f"dashboard:sellers:{org}:{store}:2026-03-01_2026-03-18") is None
    # Other store not affected
    assert await rc.get_cached(f"dashboard:overview:{org}:other_store:2026-03-01_2026-03-18") is not None
