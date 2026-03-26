import json
from redis.asyncio import Redis

redis: Redis = None  # initialized in lifespan


async def get_cached(key: str) -> dict | None:
    value = await redis.get(key)
    if value is None:
        return None
    return json.loads(value)


async def set_cached(key: str, data: dict, ttl_seconds: int = 300) -> None:
    await redis.setex(key, ttl_seconds, json.dumps(data, default=str))


async def invalidate_store_cache(org_id: str, store_id: str) -> None:
    """Delete all cache keys for this store."""
    pattern = f"dashboard:*:{org_id}:{store_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break


async def invalidate_org_cache(org_id: str) -> None:
    """Delete all cache keys for the organization."""
    pattern = f"dashboard:*:{org_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break
