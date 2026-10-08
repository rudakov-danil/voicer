import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _language_params() -> dict:
    """DEEPGRAM_LANGUAGE=auto (или пусто) — Deepgram сам определяет язык записи."""
    lang = (settings.DEEPGRAM_LANGUAGE or "").strip().lower()
    return {"detect_language": "true"} if lang in ("", "auto") else {"language": lang}


def _fallback_language() -> str:
    lang = (settings.DEEPGRAM_LANGUAGE or "").strip().lower()
    return "ru" if lang in ("", "auto") else lang


def _detected_language(channel: dict, alt: dict) -> str:
    # При detect_language язык приходит в channels[0].detected_language
    return (channel.get("detected_language") or alt.get("language") or _fallback_language()).lower()


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
        "speaker_confidence": float | None,  # уверенность Deepgram в спикере (0..1)
    }
    Таймаут: 1800 секунд (для длинных файлов).
    """
    if not settings.DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY не задан")

    params = {
        "smart_format": "true",
        **_language_params(),
        "model": settings.DEEPGRAM_MODEL,
        "diarize_model": "latest",  # разделение на спикеров; вместе с diarize Deepgram отвечает 400
        "paragraphs": "true",    # группировка подряд идущих реплик одного спикера в крупные блоки
        "utterances": "true",    # сегментация на смысловые реплики (по паузам ≥0.8с) — fallback
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
    return _parse_deepgram_response(resp.json())


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
        return {"text": "", "language": _fallback_language(), "segments": []}

    alternatives = channels[0].get("alternatives") or []
    if not alternatives:
        return {"text": "", "language": _fallback_language(), "segments": []}

    alt = alternatives[0]
    full_text = (alt.get("transcript") or "").strip()
    language = _detected_language(channels[0], alt)

    segments: list[dict] = []

    # 1. paragraphs — приоритет. Каждый параграф = один speaker + цельный блок текста.
    #    Если Deepgram не уверен в спикере абзаца (обычно люди перебивают друг друга),
    #    абзац режется на предложения: diarize-worker проверит их через LLM.
    paragraphs_obj = alt.get("paragraphs") or {}
    words = alt.get("words") or []
    for paragraph in paragraphs_obj.get("paragraphs") or []:
        par_speaker = paragraph.get("speaker")
        speaker = int(par_speaker) if par_speaker is not None else None
        sents = [s for s in paragraph.get("sentences") or [] if (s.get("text") or "").strip()]
        if not sents:
            continue
        par_words = _paragraph_words(paragraph, sents, words)
        confidence = _speaker_confidence(par_words)
        if confidence is not None and confidence < settings.SPEAKER_CONFIDENCE_MIN:
            for sent, sent_words in zip(sents, _split_by_sentences(sents, par_words)):
                segments.append({
                    "start": float(sent.get("start", 0.0)),
                    "end": float(sent.get("end", 0.0)),
                    "text": sent["text"].strip(),
                    "avg_logprob": None,
                    "speaker": speaker,
                    "speaker_confidence": _speaker_confidence(sent_words),
                })
            continue
        start = paragraph.get("start", sents[0].get("start", 0.0))
        end = paragraph.get("end", sents[-1].get("end", 0.0))
        segments.append({
            "start": float(start),
            "end": float(end),
            "text": " ".join(s["text"].strip() for s in sents),
            "avg_logprob": None,
            "speaker": speaker,
            "speaker_confidence": confidence,
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
    uncertain = sum(1 for s in segments
                    if s.get("speaker_confidence") is not None and s["speaker_confidence"] < settings.SPEAKER_CONFIDENCE_MIN)
    logger.info(
        f"Deepgram parsed: {len(segments)} segments, speakers={speakers if speakers else 'none'}, "
        f"uncertain_speaker={uncertain}, language={language}, total_text={len(full_text)}ch"
    )

    return {
        "text": full_text,
        "language": language,
        "segments": segments,
    }


def _paragraph_words(paragraph: dict, sents: list[dict], words: list[dict]) -> list[dict]:
    """Слова абзаца: тот же спикер и начало внутри абзаца.
    Абзацы разных спикеров могут пересекаться по времени, поэтому сверяем и спикера."""
    start = float(paragraph.get("start", sents[0].get("start", 0.0)))
    end = float(paragraph.get("end", sents[-1].get("end", 0.0)))
    speaker = paragraph.get("speaker")
    return [
        w for w in words
        if w.get("speaker") == speaker and start - 0.01 <= float(w.get("start", 0.0)) <= end + 0.01
    ]


def _split_by_sentences(sents: list[dict], words: list[dict]) -> list[list[dict]]:
    """Слова по предложениям: слово относится к предложению, если началось раньше следующего."""
    out: list[list[dict]] = []
    i = 0
    for k in range(len(sents)):
        next_start = float(sents[k + 1].get("start", 0.0)) if k + 1 < len(sents) else float("inf")
        chunk = []
        while i < len(words) and float(words[i].get("start", 0.0)) < next_start:
            chunk.append(words[i])
            i += 1
        out.append(chunk)
    return out


def _speaker_confidence(words: list[dict]) -> float | None:
    """Средняя уверенность Deepgram в спикере по словам; None, если Deepgram её не прислал."""
    values = [float(w["speaker_confidence"]) for w in words if w.get("speaker_confidence") is not None]
    return round(sum(values) / len(values), 3) if values else None
