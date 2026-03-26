import asyncio
import io
import json
import logging
import uuid
from datetime import datetime, timezone

import aio_pika
from pydub import AudioSegment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.diarization import segment_conversations
from app.llm_client import get_llm_client
from app.minio_client import delete_object, download_bytes, upload_bytes
from app.models import Transcript, TranscriptSegment
from app.rabbitmq import publish
from app.whisper_client import transcribe_audio

logger = logging.getLogger(__name__)

AUDIO_FULL_BUCKET = "voiceiq-audio-full"
RECORDINGS_BUCKET = "voiceiq-recordings"


def _cut_audio_segment(full_audio_bytes: bytes, start_ms: int, end_ms: int) -> bytes:
    """Cut a slice from full_day.wav and return WAV bytes."""
    audio = AudioSegment.from_wav(io.BytesIO(full_audio_bytes))
    segment = audio[start_ms:end_ms]
    buf = io.BytesIO()
    segment.export(buf, format="wav")
    return buf.getvalue()


async def process_transcribe_full_message(
    message: aio_pika.IncomingMessage,
    session_maker: async_sessionmaker,
) -> None:
    # Ack/nack вручную — не используем message.process(),
    # т.к. Whisper может работать 10-15 минут и heartbeat RabbitMQ
    # закрывает канал раньше, чем завершится обработка.
    try:
        payload = json.loads(message.body)
        device_id = payload["device_id"]
        seller_id = payload["seller_id"]
        store_id = payload["store_id"]
        organization_id = payload["organization_id"]
        audio_path = payload["audio_path"]
        session_date = payload["session_date"]

        # 1. Download full_day.wav from MinIO
        parts = audio_path.split("/", 1)
        bucket = parts[0]
        object_name = parts[1]
        full_audio_bytes = download_bytes(bucket, object_name)

        # 2. Transcribe with Whisper
        whisper_result = await transcribe_audio(full_audio_bytes, "full_day.wav")
        full_text = whisper_result.get("text", "")
        language = whisper_result.get("language", "ru")
        whisper_segments = whisper_result.get("segments", [])

        # Compute total duration
        duration_seconds = None
        if whisper_segments:
            duration_seconds = int(whisper_segments[-1]["end"])

        # 3. Segment conversations via LLM
        llm_client = get_llm_client()
        conversation_boundaries = await segment_conversations(whisper_result, llm_client)

        if not conversation_boundaries:
            # Fallback: весь файл — один разговор
            logger.warning(f"No conversation boundaries from LLM for device={device_id} date={session_date}, treating full file as one conversation")
            total_ms = (duration_seconds * 1000) if duration_seconds else 0
            conversation_boundaries = [{"start_ms": 0, "end_ms": total_ms}]

        logger.info(f"Processing {len(conversation_boundaries)} conversation(s) for device={device_id} date={session_date}")

        # 4. For each conversation boundary: cut audio, save, create DB records
        import httpx
        async with session_maker() as db:
            for conv in conversation_boundaries:
                start_ms = conv["start_ms"]
                end_ms = conv["end_ms"]

                if end_ms <= start_ms:
                    continue

                # Cut audio segment
                conv_audio = _cut_audio_segment(full_audio_bytes, start_ms, end_ms)
                conv_duration = (end_ms - start_ms) // 1000

                # Save conversation WAV to MinIO
                recording_id = uuid.uuid4()
                conv_object = f"{organization_id}/{store_id}/{seller_id}/{session_date}/{recording_id}.wav"
                upload_bytes(RECORDINGS_BUCKET, conv_object, conv_audio)
                logger.info(f"Uploaded conversation audio: {conv_object}")

                # Create recording in recorder schema (via HTTP to recorder-service)
                started_at = datetime.now(timezone.utc)
                async with httpx.AsyncClient(timeout=10.0) as http:
                    rec_resp = await http.post(
                        f"{settings.RECORDER_SERVICE_URL}/api/v1/recorder/recordings/internal",
                        json={
                            "id": str(recording_id),
                            "organization_id": organization_id,
                            "store_id": store_id,
                            "seller_id": seller_id,
                            "device_id": device_id,
                            "session_date": session_date,
                            "started_at": started_at.isoformat(),
                            "duration_seconds": conv_duration,
                            "audio_path": f"{RECORDINGS_BUCKET}/{conv_object}",
                            "file_size_bytes": len(conv_audio),
                            "status": "segmented",
                        },
                    )
                    if rec_resp.status_code >= 400:
                        logger.error(f"recorder-service returned {rec_resp.status_code}: {rec_resp.text}")

                # Get segments belonging to this conversation window
                conv_segments = [
                    seg for seg in whisper_segments
                    if int(seg["start"] * 1000) >= start_ms and int(seg["end"] * 1000) <= end_ms
                ]
                logger.info(f"Conversation {start_ms}-{end_ms}ms: {len(conv_segments)} segments")

                # Build transcript text from segments
                conv_text = " ".join(seg["text"].strip() for seg in conv_segments)

                # Save transcript
                transcript = Transcript(
                    id=uuid.uuid4(),
                    recording_id=recording_id,
                    organization_id=organization_id,
                    store_id=store_id,
                    seller_id=seller_id,
                    full_text=conv_text or full_text,
                    language=language,
                    duration_seconds=conv_duration,
                    status="transcribed",
                    whisper_model="faster-whisper-small",
                )
                db.add(transcript)
                await db.flush()
                logger.info(f"Saved transcript {transcript.id}")

                # Save raw segments (speaker_role=unknown)
                for idx, seg in enumerate(conv_segments):
                    seg_start_ms = int(seg["start"] * 1000) - start_ms
                    seg_end_ms = int(seg["end"] * 1000) - start_ms
                    db_seg = TranscriptSegment(
                        transcript_id=transcript.id,
                        speaker_role="unknown",
                        text=seg["text"].strip(),
                        start_ms=max(0, seg_start_ms),
                        end_ms=max(0, seg_end_ms),
                        segment_index=idx,
                        avg_logprob=seg.get("avg_logprob"),
                    )
                    db.add(db_seg)

                await db.commit()
                logger.info(f"Committed transcript + {len(conv_segments)} segments")

                # Publish to queue.diarize
                await publish("queue.diarize", {
                    "recording_id": str(recording_id),
                    "transcript_id": str(transcript.id),
                    "seller_id": seller_id,
                    "store_id": store_id,
                    "organization_id": organization_id,
                })

        # 5. Delete full_day.wav
        delete_object(bucket, object_name)
        logger.info(f"Done: device={device_id} date={session_date}, {len(conversation_boundaries)} conversation(s)")

        await message.ack()

    except Exception as e:
        logger.error(f"Transcribe worker error: {e}", exc_info=True)
        await message.nack(requeue=False)


async def run_transcribe_worker(session_maker: async_sessionmaker) -> None:
    # heartbeat=0 отключает heartbeat — канал не закрывается при долгих операциях (Whisper ~13 мин)
    rabbitmq_url = settings.RABBITMQ_URL.rstrip("/") + "?heartbeat=0"
    connection = await aio_pika.connect_robust(rabbitmq_url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue("queue.transcribe_full", durable=True)

    async def on_message(msg: aio_pika.IncomingMessage):
        await process_transcribe_full_message(msg, session_maker)

    await queue.consume(on_message)
    logger.info("Transcribe worker started, consuming queue.transcribe_full")
    await asyncio.Future()


if __name__ == "__main__":
    from app.database import async_session_maker
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_transcribe_worker(async_session_maker))
