import logging
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    """
    Отправляет аудио в Deepgram Speech-to-Text API с включённой диаризацией.

    Возвращает: {
        "text": str,
        "language": str,
        "segments": list[dict]
    }
    Каждый сегмент: {
        "start": float (sec),
        "end": float (sec),
        "text": str,
        "avg_logprob": float | None,
        "speaker": int | None,    # ID акустического кластера говорящего (0, 1, 2, ...)
    }
    Таймаут: 1800 секунд (для длинных файлов).
    """
    if not settings.DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY не задан")

    params = {
        "smart_format": "true",
        "language": settings.DEEPGRAM_LANGUAGE,
        "model": settings.DEEPGRAM_MODEL,
        "diarize": "true",       # разделение на спикеров
        "paragraphs": "true",    # группировка подряд идущих реплик одного спикера в крупные блоки
        "utterances": "true",    # сегментация на смысловые реплики (по паузам ≥0.8с) — fallback
    }
    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": {
            ".webm": "audio/webm", ".mp4": "audio/mp4", ".m4a": "audio/mp4",
            ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav",
        }.get(Path(filename).suffix.lower(), "application/octet-stream"),
    }

    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(
            settings.DEEPGRAM_API_URL,
            params=params,
            headers=headers,
            content=audio_bytes,
        )
    resp.raise_for_status()
    return _parse_deepgram_response(resp.json())


async def transcribe_audio_multichannel(audio_bytes: bytes, operator_channel: int = 0) -> dict:
    """
    Транскрибация стерео-записи звонка с раздельными каналами (АТС пишет оператора
    и клиента в разные каналы). Каждый канал транскрибируется отдельно, роль
    определяется по номеру канала — диаризация через LLM не нужна.

    Возвращает: {
        "text": str,
        "language": str,
        "segments": list[dict]  # каждый сегмент дополнительно содержит "role": "seller"|"customer"
    }
    """
    if not settings.DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY не задан")

    params = {
        "smart_format": "true",
        "language": settings.DEEPGRAM_LANGUAGE,
        "model": settings.DEEPGRAM_MODEL,
        "multichannel": "true",  # раздельная транскрибация каналов
        "utterances": "true",    # utterances несут номер канала
    }
    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav",
    }

    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(
            settings.DEEPGRAM_API_URL,
            params=params,
            headers=headers,
            content=audio_bytes,
        )
    resp.raise_for_status()
    return _parse_multichannel_response(resp.json(), operator_channel)


def _parse_multichannel_response(payload: dict, operator_channel: int) -> dict:
    """Собирает сегменты из utterances с привязкой канал → роль.

    Если в ответе нет utterances с каналами (например, файл оказался моно),
    возвращает segments=[] и поле "multichannel_failed": True — вызывающий код
    откатится на обычную транскрибацию с диаризацией.
    """
    results = payload.get("results") or {}
    utterances = results.get("utterances") or []

    segments: list[dict] = []
    channels_seen: set[int] = set()
    for utt in utterances:
        text = (utt.get("transcript") or "").strip()
        if not text:
            continue
        channel = utt.get("channel")
        if channel is None:
            continue
        channel = int(channel)
        channels_seen.add(channel)
        segments.append({
            "start": float(utt.get("start", 0.0)),
            "end": float(utt.get("end", 0.0)),
            "text": text,
            "avg_logprob": float(utt["confidence"]) if utt.get("confidence") is not None else None,
            "speaker": channel,
            "role": "seller" if channel == operator_channel else "customer",
        })

    # Меньше двух каналов с речью — канальная диаризация не имеет смысла
    if len(channels_seen) < 2:
        logger.warning(
            f"Multichannel parse: only {len(channels_seen)} channel(s) with speech — "
            "falling back to standard diarization"
        )
        return {"text": "", "language": settings.DEEPGRAM_LANGUAGE, "segments": [], "multichannel_failed": True}

    segments.sort(key=lambda s: s["start"])
    full_text = " ".join(s["text"] for s in segments)

    language = settings.DEEPGRAM_LANGUAGE
    channels = results.get("channels") or []
    if channels:
        alts = channels[0].get("alternatives") or []
        if alts and alts[0].get("language"):
            language = alts[0]["language"].lower()

    logger.info(
        f"Deepgram multichannel parsed: {len(segments)} segments, "
        f"channels={sorted(channels_seen)}, operator_channel={operator_channel}"
    )
    return {"text": full_text, "language": language, "segments": segments}


def _parse_deepgram_response(payload: dict) -> dict:
    """
    Маппит ответ Deepgram в плоскую структуру.

    Источники сегментов в порядке приоритета:
      1. paragraphs.paragraphs[]  — лучше всего: один параграф = один спикер, склеены все его подряд идущие
                                    предложения. Чистые границы, минимум "грязных" кластеров.
      2. results.utterances[]      — fallback: режется по паузам ≥0.8с, на TTS-аудио может рвать длинные фразы.
      3. один сегмент со всем текстом — крайний fallback.
    """
    results = payload.get("results") or {}
    channels = results.get("channels") or []
    if not channels:
        return {"text": "", "language": settings.DEEPGRAM_LANGUAGE, "segments": []}

    alternatives = channels[0].get("alternatives") or []
    if not alternatives:
        return {"text": "", "language": settings.DEEPGRAM_LANGUAGE, "segments": []}

    alt = alternatives[0]
    full_text = (alt.get("transcript") or "").strip()
    language = (alt.get("language") or settings.DEEPGRAM_LANGUAGE).lower()

    segments: list[dict] = []

    # 1. paragraphs — приоритет. Каждый параграф = один speaker + цельный блок текста.
    paragraphs_obj = alt.get("paragraphs") or {}
    for paragraph in paragraphs_obj.get("paragraphs") or []:
        par_speaker = paragraph.get("speaker")
        sents = paragraph.get("sentences") or []
        if not sents:
            continue
        text = " ".join((s.get("text") or "").strip() for s in sents).strip()
        if not text:
            continue
        start = paragraph.get("start", sents[0].get("start", 0.0))
        end = paragraph.get("end", sents[-1].get("end", 0.0))
        segments.append({
            "start": float(start),
            "end": float(end),
            "text": text,
            "avg_logprob": None,
            "speaker": int(par_speaker) if par_speaker is not None else None,
        })

    # 2. utterances — fallback если paragraphs пуст
    if not segments:
        for utt in results.get("utterances") or []:
            text = (utt.get("transcript") or "").strip()
            if not text:
                continue
            speaker = utt.get("speaker")
            segments.append({
                "start": float(utt.get("start", 0.0)),
                "end": float(utt.get("end", 0.0)),
                "text": text,
                "avg_logprob": float(utt["confidence"]) if utt.get("confidence") is not None else None,
                "speaker": int(speaker) if speaker is not None else None,
            })

    # 3. single-segment fallback
    if not segments and full_text:
        words = alt.get("words") or []
        end_time = float(words[-1].get("end", 0.0)) if words else 0.0
        segments.append({
            "start": 0.0,
            "end": end_time,
            "text": full_text,
            "avg_logprob": float(alt["confidence"]) if alt.get("confidence") is not None else None,
            "speaker": None,
        })

    speakers = sorted({s["speaker"] for s in segments if s.get("speaker") is not None})
    logger.info(
        f"Deepgram parsed: {len(segments)} segments, speakers={speakers if speakers else 'none'}, "
        f"language={language}, total_text={len(full_text)}ch"
    )

    return {
        "text": full_text,
        "language": language,
        "segments": segments,
    }
