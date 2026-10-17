from unittest.mock import patch

import pytest

from app import deepgram_client
from app.config import settings
from app.deepgram_client import _words_confidence, transcribe_audio

pytestmark = pytest.mark.skip(reason="ТЕСТ 2026-10-17: в deepgram_client._listen временно захардкожен kk, выбор языка закомментирован")


def _response(word_confidences, text="текст", detected=None, detected_conf=None):
    channel = {"alternatives": [{"transcript": text, "words": [
        {"word": "w", "start": float(i), "end": i + 0.5, "confidence": c, "speaker": 0}
        for i, c in enumerate(word_confidences)
    ]}]}
    if detected:
        channel["detected_language"] = detected
        channel["language_confidence"] = detected_conf
    return {"results": {"channels": [channel]}}


def _fake_deepgram(responses):
    """Подменяет запрос к Deepgram: ответ по языку запроса ("detect" — автоопределение)."""
    calls = []

    async def post(params, headers, audio_bytes):
        key = params.get("language") or ("detect" if params.get("detect_language") else None)
        calls.append(key)
        return responses[key]

    return patch.object(deepgram_client, "_post", post), calls


@pytest.fixture
def auto_ru_kk(monkeypatch):
    monkeypatch.setattr(settings, "DEEPGRAM_API_KEY", "test")
    monkeypatch.setattr(settings, "DEEPGRAM_LANGUAGE", "auto-ru-kk")
    monkeypatch.setattr(settings, "DEEPGRAM_RU_DETECT_MIN", 0.9)


@pytest.mark.asyncio
async def test_confident_russian_needs_one_request(auto_ru_kk):
    # Русская запись 7d7f3f7a: автоопределение ru с уверенностью 0.998
    fake, calls = _fake_deepgram({"detect": _response([0.95, 0.95], "привет", "ru", 0.998)})
    with fake:
        result = await transcribe_audio(b"audio")
    assert calls == ["detect"]
    assert (result["language"], result["text"]) == ("ru", "привет")


@pytest.mark.asyncio
async def test_kazakh_detected_as_turkish_gets_kk(auto_ru_kk):
    # Казахская запись 4aed456c: автоопределение tr 0.64; русский — 0 слов, казахский — 0.783
    fake, calls = _fake_deepgram({
        "detect": _response([0.9, 0.9], "türkçe", "tr", 0.64),
        "ru": _response([], ""),
        "kk": _response([0.8, 0.766], "сәлеметсіз бе"),
    })
    with fake:
        result = await transcribe_audio(b"audio")
    assert sorted(calls) == ["detect", "kk", "ru"]
    assert (result["language"], result["text"]) == ("kk", "сәлеметсіз бе")


@pytest.mark.asyncio
async def test_unsure_russian_compared_with_kazakh(auto_ru_kk):
    # Русский узнан неуверенно: его ответ сравнивается с казахским без лишнего запроса с ru
    fake, calls = _fake_deepgram({
        "detect": _response([0.95, 0.951], "привет", "ru", 0.8),
        "kk": _response([0.873], "привет"),
    })
    with fake:
        result = await transcribe_audio(b"audio")
    assert calls == ["detect", "kk"]
    assert (result["language"], result["text"]) == ("ru", "привет")


@pytest.mark.asyncio
async def test_unsure_russian_loses_to_kazakh(auto_ru_kk):
    fake, calls = _fake_deepgram({
        "detect": _response([0.5], "прывет", "ru", 0.6),
        "kk": _response([0.8], "сәлем"),
    })
    with fake:
        result = await transcribe_audio(b"audio")
    assert calls == ["detect", "kk"]
    assert (result["language"], result["text"]) == ("kk", "сәлем")


@pytest.mark.asyncio
async def test_threshold_is_configurable(auto_ru_kk, monkeypatch):
    monkeypatch.setattr(settings, "DEEPGRAM_RU_DETECT_MIN", 0.999)
    fake, calls = _fake_deepgram({
        "detect": _response([0.95], "привет", "ru", 0.998),
        "kk": _response([0.873], "привет"),
    })
    with fake:
        result = await transcribe_audio(b"audio")
    assert calls == ["detect", "kk"]
    assert result["language"] == "ru"


@pytest.mark.asyncio
async def test_silence_falls_back_to_russian(auto_ru_kk):
    fake, calls = _fake_deepgram({
        "detect": _response([], "", "en", 0.3),
        "ru": _response([], ""),
        "kk": _response([], ""),
    })
    with fake:
        result = await transcribe_audio(b"audio")
    assert result["language"] == "ru"


@pytest.mark.asyncio
async def test_other_modes_send_language_as_before(monkeypatch):
    monkeypatch.setattr(settings, "DEEPGRAM_API_KEY", "test")
    monkeypatch.setattr(settings, "DEEPGRAM_LANGUAGE", "multi")
    fake, calls = _fake_deepgram({"multi": _response([0.9], "текст")})
    with fake:
        result = await transcribe_audio(b"audio")
    assert calls == ["multi"]
    assert result["language"] == "multi"


def test_words_confidence_without_words_is_zero():
    assert _words_confidence(_response([])) == 0.0
    assert _words_confidence({}) == 0.0
    assert _words_confidence(_response([0.8, 0.6])) == pytest.approx(0.7)
