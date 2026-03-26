import asyncio
import json
import logging
import aio_pika
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import AsyncSessionLocal
from app import redis_client as rc
from app.alerts import check_and_send_score_alert

logger = logging.getLogger(__name__)


async def process_cache_invalidate_message(message: aio_pika.IncomingMessage):
    async with message.process():
        try:
            payload = json.loads(message.body)
            store_id = payload["store_id"]
            org_id = payload["organization_id"]
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Invalid cache invalidation message: %s", e)
            return

        # Invalidate cache
        await rc.invalidate_store_cache(org_id, store_id)
        logger.info("Invalidated cache for store %s org %s", store_id, org_id)

        # Check alerts
        async with AsyncSessionLocal() as db:
            from sqlalchemy import text
            import uuid

            # Get the latest conversation for this store
            result = await db.execute(
                text("""
                    SELECT overall_score
                    FROM analytics.conversations
                    WHERE store_id = :store_id AND organization_id = :org_id
                    ORDER BY analyzed_at DESC
                    LIMIT 1
                """),
                {"store_id": uuid.UUID(store_id), "org_id": uuid.UUID(org_id)},
            )
            row = result.fetchone()
            if row and row.overall_score is not None:
                await check_and_send_score_alert(
                    org_id=org_id,
                    store_id=store_id,
                    overall_score=float(row.overall_score),
                    db=db,
                )


async def start_consuming():
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    queue = await channel.declare_queue("queue.cache.invalidate", durable=True)
    await queue.consume(process_cache_invalidate_message)
    logger.info("cache_invalidation_worker started")
    await asyncio.Future()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_consuming())
