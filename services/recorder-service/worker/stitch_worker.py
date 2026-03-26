import asyncio
import json
import logging
import uuid
from datetime import date, datetime, timezone

import aio_pika
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.audio import stitch_chunks, get_duration_ms
from app.config import settings
from app.minio_client import upload_bytes, download_bytes
from app.models import AudioChunk, Recording

logger = logging.getLogger(__name__)

AUDIO_CHUNKS_BUCKET = "voiceiq-audio-chunks"
AUDIO_FULL_BUCKET = "voiceiq-audio-full"
RECORDINGS_BUCKET = "voiceiq-recordings"


async def process_stitch_message(
    message: aio_pika.IncomingMessage,
    session_maker,
) -> None:
    async with message.process(requeue=False):
        try:
            payload = json.loads(message.body)
            device_id = payload["device_id"]
            session_date = payload["session_date"]
            session_date_obj = date.fromisoformat(session_date)
            organization_id = payload["organization_id"]
            store_id = payload["store_id"]
            seller_id = payload.get("seller_id")
            total_chunks = payload.get("total_chunks")  # expected total, sent by finalize

            async with session_maker() as db:
                # Get ALL chunks for this device+date (stitched or not), sorted by index
                result = await db.execute(
                    select(AudioChunk)
                    .where(
                        AudioChunk.device_id == device_id,
                        AudioChunk.session_date == session_date_obj,
                    )
                    .order_by(AudioChunk.chunk_index)
                )
                chunks = result.scalars().all()

                if not chunks:
                    logger.info(f"No chunks for device={device_id} date={session_date}")
                    return

                # If badge told us total_chunks — verify all arrived before stitching
                if total_chunks is not None and len(chunks) < total_chunks:
                    logger.warning(
                        f"device={device_id} date={session_date}: "
                        f"expected {total_chunks} chunks, got {len(chunks)} — waiting"
                    )
                    return

                # Download chunk audio from MinIO (only unstitched ones)
                unstitched = [c for c in chunks if not c.stitched]
                if not unstitched:
                    logger.info(f"All chunks already stitched for device={device_id} date={session_date}")
                    return

                chunk_data_list = []
                for chunk in unstitched:
                    # audio_path format: "bucket/object_name"
                    parts = chunk.audio_path.split("/", 1)
                    bucket = parts[0]
                    obj = parts[1]
                    data = download_bytes(bucket, obj)
                    chunk_data_list.append(data)

                # Stitch
                full_audio = stitch_chunks(chunk_data_list)
                duration_ms = get_duration_ms(full_audio)

                # Save full_day.wav to MinIO
                full_object_name = f"{organization_id}/{device_id}/{session_date}/full_day.wav"
                upload_bytes(AUDIO_FULL_BUCKET, full_object_name, full_audio)

                # Mark chunks as stitched
                chunk_ids = [c.id for c in unstitched]
                await db.execute(
                    update(AudioChunk)
                    .where(AudioChunk.id.in_(chunk_ids))
                    .values(stitched=True)
                )
                await db.commit()

            # Publish to queue.transcribe_full
            from app.rabbitmq import publish
            audio_path = f"{AUDIO_FULL_BUCKET}/{full_object_name}"
            await publish("queue.transcribe_full", {
                "device_id": device_id,
                "seller_id": seller_id,
                "store_id": store_id,
                "organization_id": organization_id,
                "audio_path": audio_path,
                "session_date": session_date,
            })

            logger.info(f"Stitched {len(chunks)} chunks for device={device_id} date={session_date}")

        except Exception as e:
            logger.error(f"Stitch worker error: {e}", exc_info=True)
            raise


async def run_stitch_worker(session_maker) -> None:
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)

    queue = await channel.declare_queue("queue.stitch", durable=True)

    async def on_message(message: aio_pika.IncomingMessage):
        await process_stitch_message(message, session_maker)

    await queue.consume(on_message)
    logger.info("Stitch worker started, consuming queue.stitch")
    await asyncio.Future()


if __name__ == "__main__":
    from app.database import async_session_maker
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_stitch_worker(async_session_maker))
