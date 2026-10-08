"""Распознавание речи через Deepgram.

Казахский (kk / kk-KZ) поддерживается моделью nova-3 и только в batch-режиме —
для потокового распознавания он недоступен, поэтому файл отправляется целиком.
"""
import logging
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class ASRError(RuntimeError):
    pass


async def transcribe(wav_path: Path) -> dict:
    """Возвращает {"language": str, "text": str, "segments": [{start, end, text}]}."""
    if not settings.DEEPGRAM_API_KEY:
        raise ASRError("DEEPGRAM_API_KEY не задан")

    params = {
        "model": settings.DEEPGRAM_MODEL,
        "language": settings.ASR_LANGUAGE,
        "punctuate": "true",
        "smart_format": "true",
        "paragraphs": "true",
        "utterances": "true",
    }
    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav",
    }

    audio_bytes = wav_path.read_bytes()
    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(
            settings.DEEPGRAM_API_URL, params=params, headers=headers, content=audio_bytes
        )
    if resp.status_code >= 400:
        raise ASRError(f"Deepgram вернул {resp.status_code}: {resp.text[:400]}")
    return _parse(resp.json())


def _parse(payload: dict) -> dict:
    results = payload.get("results") or {}
    channels = results.get("channels") or []
    alternatives = (channels[0].get("alternatives") if channels else None) or []
    alt = alternatives[0] if alternatives else {}

    full_text = (alt.get("transcript") or "").strip()
    language = (alt.get("language") or settings.ASR_LANGUAGE).lower()

    segments: list[dict] = []

    # utterances — основной источник: режется по паузам, границы совпадают с
    # естественными смысловыми паузами выступления.
    for utt in results.get("utterances") or []:
        text = (utt.get("transcript") or "").strip()
        if text:
            segments.append({
                "start": float(utt.get("start") or 0.0),
                "end": float(utt.get("end") or 0.0),
                "text": text,
            })

    # fallback: параграфы, если utterances не пришли
    if not segments:
        paragraphs = ((alt.get("paragraphs") or {}).get("paragraphs")) or []
        for para in paragraphs:
            sentences = para.get("sentences") or []
            text = " ".join((s.get("text") or "").strip() for s in sentences).strip()
            if text:
                segments.append({
                    "start": float(para.get("start") or 0.0),
                    "end": float(para.get("end") or 0.0),
                    "text": text,
                })

    # крайний fallback: одна «простыня»
    if not segments and full_text:
        segments.append({"start": 0.0, "end": 0.0, "text": full_text})

    logger.info("Deepgram: язык=%s, сегментов=%d, символов=%d",
                language, len(segments), len(full_text))
    return {"language": language, "text": full_text, "segments": segments}
