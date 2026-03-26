import httpx
from app.config import settings


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    """
    Отправляет аудио на Whisper-сервер.
    Возвращает: { "text": str, "language": str, "segments": list[dict] }
    Каждый сегмент: { "start": float (sec), "end": float (sec), "text": str, "avg_logprob": float }
    Таймаут: 300 секунд.
    """
    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(
            f"{settings.WHISPER_SERVER_URL}/transcribe",
            files={"file": (filename, audio_bytes, "audio/wav")},
            data={"language": "ru", "task": "transcribe"},
        )
    resp.raise_for_status()
    return resp.json()
