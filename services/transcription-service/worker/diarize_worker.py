import asyncio
import json
import logging

import aio_pika
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings
from app.diarization import diarize_segments, identify_speaker_roles, roles_by_talk_time
from app.llm_client import get_llm_client
from app.models import Transcript, TranscriptSegment
from app.rabbitmq import publish

logger = logging.getLogger(__name__)

# Временно: роли только по диаризации Deepgram, без LLM — проверяем, как она справляется одна.
# Вернуть LLM: True.
ROLES_BY_LLM = False


async def process_diarize_message(
    message: aio_pika.IncomingMessage,
    session_maker: async_sessionmaker,
) -> None:
    payload = json.loads(message.body)
    recording_id = payload["recording_id"]
    transcript_id = payload["transcript_id"]
    seller_id = payload["seller_id"]
    store_id = payload["store_id"]
    organization_id = payload["organization_id"]

    try:
        async with session_maker() as db:
            # 1. Load segments
            result = await db.execute(
                select(TranscriptSegment)
                .where(TranscriptSegment.transcript_id == transcript_id)
                .order_by(TranscriptSegment.segment_index)
            )
            segments = result.scalars().all()

            if not segments:
                logger.warning(f"No segments for transcript_id={transcript_id}")
                await message.ack()
                return

            # 2. Get seller name from admin-service using internal service key
            seller_name = "Продавец"
            try:
                async with httpx.AsyncClient(timeout=5.0) as http:
                    resp = await http.get(
                        f"{settings.ADMIN_SERVICE_URL}/api/v1/admin/sellers/{seller_id}",
                        headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        full = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
                        if full:
                            seller_name = full
            except Exception as e:
                logger.warning(f"Could not get seller name: {e}")

            # 3. Diarize. Стратегия:
            #    a) Если у сегментов есть speaker_id от Deepgram — кластерная диаризация
            #       (LLM только классифицирует спикеров на работник/клиент). Точно и дёшево.
            #    b) Fallback: текстовая диаризация по содержанию реплик (старый путь,
            #       для записей до включения Deepgram diarize).
            llm_client = get_llm_client()
            seg_dicts = [
                {
                    "text": s.text,
                    "start_ms": s.start_ms,
                    "end_ms": s.end_ms,
                    "speaker_id": s.speaker_id,
                }
                for s in segments
            ]
            unique_speaker_ids = {s["speaker_id"] for s in seg_dicts if s["speaker_id"] is not None}
            use_cluster = len(unique_speaker_ids) >= 2
            logger.info(
                f"Starting diarization of {len(seg_dicts)} segments for transcript_id={transcript_id}, "
                f"unique_speaker_ids={len(unique_speaker_ids)}, "
                f"strategy={'deepgram-only' if not ROLES_BY_LLM else 'cluster' if use_cluster else 'text-fallback'}"
            )

            if not ROLES_BY_LLM:
                roles = roles_by_talk_time(seg_dicts)
                logger.info(
                    f"Roles by Deepgram speakers only (no LLM): "
                    f"seller={roles.count('seller')}, customer={roles.count('customer')}, unknown={roles.count('unknown')}"
                )
            elif use_cluster:
                # Кластерная: один LLM-запрос «кто из спикеров — работник»
                speaker_roles = await identify_speaker_roles(seg_dicts, seller_name, llm_client)
                roles = []
                for s in seg_dicts:
                    sid = s["speaker_id"]
                    if sid is None or sid not in speaker_roles:
                        roles.append("unknown")
                    else:
                        roles.append(speaker_roles[sid])
            else:
                # Fallback на текстовую диаризацию.
                # Срабатывает когда Deepgram вернул 0 или 1 уникальный спикер —
                # типично для слабых моделей или сильно перекрытых голосов.
                roles = await diarize_segments(seg_dicts, seller_name, llm_client)

            # 4. Update speaker_role in DB
            for seg, role in zip(segments, roles):
                seg.speaker_role = role

            # 5. Update transcript status
            transcript = (await db.execute(
                select(Transcript).where(Transcript.id == transcript_id)
            )).scalar_one_or_none()
            if transcript:
                transcript.status = "diarized"

            await db.commit()
            logger.info(f"Roles committed for transcript_id={transcript_id}")

        # 6. Update recording status in recorder-service
        try:
            async with httpx.AsyncClient(timeout=5.0) as http:
                await http.patch(
                    f"{settings.RECORDER_SERVICE_URL}/api/v1/recorder/recordings/{recording_id}/status",
                    params={"status": "transcribed"},
                )
        except Exception as e:
            logger.warning(f"Could not update recording status: {e}")

        # 7. Publish to queue.analyze
        await publish("queue.analyze", {
            "recording_id": recording_id,
            "transcript_id": transcript_id,
            "seller_id": seller_id,
            "store_id": store_id,
            "organization_id": organization_id,
        })

        logger.info(f"Diarized transcript_id={transcript_id}")
        await message.ack()

    except Exception as e:
        logger.error(f"Diarize worker error: {e}", exc_info=True)
        try:
            await message.nack(requeue=False)
        except Exception:
            pass


async def run_diarize_worker(session_maker: async_sessionmaker) -> None:
    rabbitmq_url = settings.RABBITMQ_URL
    if "heartbeat" not in rabbitmq_url:
        rabbitmq_url = rabbitmq_url.rstrip("/") + "?heartbeat=0"
    connection = await aio_pika.connect_robust(rabbitmq_url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue("queue.diarize", durable=True)

    async def on_message(msg: aio_pika.IncomingMessage):
        await process_diarize_message(msg, session_maker)

    await queue.consume(on_message)
    logger.info("Diarize worker started, consuming queue.diarize")
    await asyncio.Future()


if __name__ == "__main__":
    from app.database import async_session_maker
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_diarize_worker(async_session_maker))
