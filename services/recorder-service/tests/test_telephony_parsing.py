"""Тесты телефонии без БД: определение каналов WAV и парсинг multichannel-ответа Deepgram."""
import io
import struct
import wave

from app.deepgram_client import _parse_multichannel_response
from app.wav_utils import detect_wav_channels as _detect_wav_channels, file_ext as _file_ext


def make_wav(channels: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 1600 * channels)
    return buf.getvalue()


def test_detect_wav_channels_mono():
    assert _detect_wav_channels(make_wav(1)) == 1


def test_detect_wav_channels_stereo():
    assert _detect_wav_channels(make_wav(2)) == 2


def test_detect_wav_channels_not_wav():
    assert _detect_wav_channels(b"ID3\x03mp3 data here" + b"\x00" * 100) is None
    assert _detect_wav_channels(b"") is None


def test_detect_wav_channels_extra_chunk_before_fmt():
    """Некоторые рекордеры пишут JUNK/LIST chunk перед fmt — заголовок всё равно парсится."""
    wav = make_wav(2)
    # Вставляем JUNK chunk сразу после "WAVE"
    junk = b"JUNK" + struct.pack("<I", 4) + b"\x00\x00\x00\x00"
    patched = wav[:12] + junk + wav[12:]
    assert _detect_wav_channels(patched) == 2


def test_file_ext():
    assert _file_ext("call.WAV") == ".wav"
    assert _file_ext("record.mp3") == ".mp3"
    assert _file_ext("noext") == ""
    assert _file_ext(None) == ""


def _utterance(channel: int, start: float, end: float, text: str) -> dict:
    return {"channel": channel, "start": start, "end": end, "transcript": text, "confidence": 0.9}


def test_multichannel_two_channels_roles():
    payload = {
        "results": {
            "utterances": [
                _utterance(0, 0.0, 3.0, "Здравствуйте, компания Ромашка"),
                _utterance(1, 3.5, 6.0, "Добрый день, хочу узнать про доставку"),
                _utterance(0, 6.5, 10.0, "Конечно, подскажите номер заказа"),
            ],
            "channels": [],
        }
    }
    result = _parse_multichannel_response(payload, operator_channel=0)
    assert not result.get("multichannel_failed")
    segments = result["segments"]
    assert len(segments) == 3
    assert segments[0]["role"] == "seller"
    assert segments[1]["role"] == "customer"
    assert segments[2]["role"] == "seller"
    # Сегменты отсортированы по времени
    assert [s["start"] for s in segments] == sorted(s["start"] for s in segments)


def test_multichannel_operator_channel_1():
    payload = {
        "results": {
            "utterances": [
                _utterance(0, 0.0, 3.0, "клиент"),
                _utterance(1, 3.0, 6.0, "оператор"),
            ],
        }
    }
    result = _parse_multichannel_response(payload, operator_channel=1)
    roles = {s["text"]: s["role"] for s in result["segments"]}
    assert roles["оператор"] == "seller"
    assert roles["клиент"] == "customer"


def test_multichannel_single_channel_falls_back():
    """Один канал с речью (файл оказался моно) → multichannel_failed, откат на диаризацию."""
    payload = {
        "results": {
            "utterances": [
                _utterance(0, 0.0, 3.0, "вся речь в одном канале"),
                _utterance(0, 3.0, 6.0, "и тут тоже"),
            ],
        }
    }
    result = _parse_multichannel_response(payload, operator_channel=0)
    assert result.get("multichannel_failed") is True
    assert result["segments"] == []


def test_multichannel_empty_response():
    result = _parse_multichannel_response({"results": {}}, operator_channel=0)
    assert result.get("multichannel_failed") is True
