"""Распознавание речи через OpenRouter (по умолчанию ElevenLabs Scribe v2) — включается STT_PROVIDER=openrouter.

Возвращает тот же формат, что deepgram_client.transcribe_audio: {"text", "language", "segments"}.
Реплика — подряд идущие слова одного говорящего без паузы длиннее PAUSE_S; её предложения
лежат в "sentences" (по ним conversation_split режет реплику на стыке двух разговоров).
Scribe не сообщает уверенность в говорящем, поэтому speaker_confidence = None:
diarize-worker такие реплики голосом не перепроверяет.
"""
import base64
import logging
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

PAUSE_S = 1.5  # пауза, после которой начинается новая реплика того же говорящего
_SENTENCE_END = (".", "!", "?", "…")
# Scribe возвращает коды ISO 639-3, а в transcripts.language пишем привычные двухбуквенные
_LANG_CODES = {"rus": "ru", "kaz": "kk", "eng": "en", "uzb": "uz", "kir": "ky", "tur": "tr", "bak": "ba"}


def _url() -> str:
    base = settings.LLM_SERVER_URL.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    return f"{base}/v1/audio/transcriptions"


def _language_hint() -> str:
    lang = (settings.STT_LANGUAGE or "").strip().lower()
    return "" if lang in ("", "auto") else lang


async def transcribe(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY (ключ OpenRouter) не задан")
    body = {
        "model": settings.STT_MODEL,
        "input_audio": {
            "data": base64.b64encode(audio_bytes).decode(),
            "format": Path(filename).suffix.lstrip(".").lower() or "wav",
        },
        "response_format": "verbose_json",
        "diarize": True,
    }
    hint = _language_hint()
    if hint:
        body["language"] = hint
    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(_url(), headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"}, json=body)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter STT {resp.status_code}: {resp.text[:300]}")
    payload = resp.json()
    result = parse_response(payload, hint)
    usage = payload.get("usage") or {}
    logger.info(
        f"OpenRouter STT ({settings.STT_MODEL}): {len(result['segments'])} segments, "
        f"speakers={sorted({s['speaker'] for s in result['segments'] if s['speaker'] is not None})}, "
        f"language={result['language']} (confidence={payload.get('language_confidence')}), "
        f"seconds={usage.get('seconds')}, cost={usage.get('cost')}"
    )
    return result


def parse_response(payload: dict, hint: str = "") -> dict:
    words = [
        w for w in payload.get("words") or []
        if w.get("type", "word") == "word" and (w.get("word") or "").strip()
    ]
    segments: list[dict] = []
    current: list[dict] = []
    for w in words:
        if current and (
            w.get("speaker") != current[-1].get("speaker")
            or float(w["start"]) - float(current[-1]["end"]) > PAUSE_S
        ):
            segments.append(_segment(current))
            current = []
        current.append(w)
    if current:
        segments.append(_segment(current))

    # Текст собираем из слов: в payload["text"] бывают пометки звуков вроде «[звонок]»
    text = " ".join(s["text"] for s in segments) or (payload.get("text") or "").strip()
    if not segments and text:
        segments = [{"start": 0.0, "end": float(payload.get("duration") or 0.0), "text": text,
                     "avg_logprob": None, "speaker": None, "speaker_confidence": None}]
    return {"text": text, "language": _language(payload, hint), "segments": segments}


def _segment(words: list[dict]) -> dict:
    sentences, buf = [], []
    for w in words:
        buf.append(w)
        if w["word"].strip().endswith(_SENTENCE_END):
            sentences.append(_sentence(buf))
            buf = []
    if buf:
        sentences.append(_sentence(buf))
    speaker = words[0].get("speaker")
    return {
        "start": float(words[0]["start"]),
        "end": float(words[-1]["end"]),
        "text": " ".join(w["word"].strip() for w in words),
        "avg_logprob": None,
        "speaker": int(speaker) if speaker is not None else None,
        "speaker_confidence": None,
        "sentences": sentences,
    }


def _sentence(words: list[dict]) -> dict:
    return {"start": float(words[0]["start"]), "end": float(words[-1]["end"]),
            "text": " ".join(w["word"].strip() for w in words), "speaker_confidence": None}


def _language(payload: dict, hint: str) -> str:
    code = (payload.get("language") or hint or "ru").strip().lower()
    return _LANG_CODES.get(code, code)[:10]
