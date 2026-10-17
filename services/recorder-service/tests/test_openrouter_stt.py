from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app import deepgram_client, openrouter_stt
from app.config import settings
from app.openrouter_stt import parse_response


def _w(word, start, end, speaker, type_="word"):
    return {"word": word, "start": start, "end": end, "speaker": speaker, "type": type_, "confidence": 0.9}


PAYLOAD = {
    "text": "[звонок] Сәлеметсіз бе! Не аласыз? Бір латте, пожалуйста.",
    "language": "kaz",
    "language_confidence": 1.0,
    "words": [
        _w("[звонок]", 0.0, 0.5, 0, "audio_event"),
        _w("Сәлеметсіз", 1.0, 1.6, 0), _w("бе!", 1.6, 1.9, 0),
        _w("Не", 2.0, 2.2, 0), _w("аласыз?", 2.2, 2.8, 0),
        _w("Бір", 3.0, 3.2, 1), _w("латте,", 3.2, 3.6, 1), _w("пожалуйста.", 3.6, 4.4, 1),
        _w("Ещё", 9.0, 9.3, 1), _w("что-то?", 9.3, 9.9, 1),  # пауза > PAUSE_S — новая реплика
    ],
}


def test_segments_by_speaker_and_pause():
    res = parse_response(PAYLOAD)
    assert res["language"] == "kk"
    assert [(s["speaker"], s["text"]) for s in res["segments"]] == [
        (0, "Сәлеметсіз бе! Не аласыз?"),
        (1, "Бір латте, пожалуйста."),
        (1, "Ещё что-то?"),
    ]
    assert res["text"].startswith("Сәлеметсіз")  # без «[звонок]»
    first = res["segments"][0]
    assert (first["start"], first["end"], first["speaker_confidence"]) == (1.0, 2.8, None)
    assert [s["text"] for s in first["sentences"]] == ["Сәлеметсіз бе!", "Не аласыз?"]


def test_empty_words_falls_back_to_text():
    res = parse_response({"text": "Добрый день", "duration": 3.0, "language": "rus"})
    assert res["language"] == "ru"
    assert res["segments"][0]["text"] == "Добрый день"


@pytest.mark.asyncio
async def test_transcribe_audio_routes_to_openrouter(monkeypatch):
    monkeypatch.setattr(settings, "STT_PROVIDER", "openrouter")
    monkeypatch.setattr(settings, "STT_LANGUAGE", "kk")
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    resp = MagicMock(status_code=200)
    resp.json.return_value = PAYLOAD
    with patch("app.openrouter_stt.httpx.AsyncClient.post", AsyncMock(return_value=resp)) as post:
        res = await deepgram_client.transcribe_audio(b"RIFF", "audio.ogg")
    body = post.call_args.kwargs["json"]
    assert body["model"] == settings.STT_MODEL and body["diarize"] is True
    assert body["language"] == "kk" and body["input_audio"]["format"] == "ogg"
    assert post.call_args.args[0].endswith("/v1/audio/transcriptions")
    assert len(res["segments"]) == 3
