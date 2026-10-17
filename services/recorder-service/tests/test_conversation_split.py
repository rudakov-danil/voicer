import io
from unittest.mock import AsyncMock, patch

import pytest
from pydub import AudioSegment
from pydub.generators import Sine

from app.conversation_split import cut_audio, find_conversations, plan_parts


def _seg(start, end, text, speaker, sentences=None):
    seg = {"start": start, "end": end, "text": text, "speaker": speaker, "speaker_confidence": 0.9}
    if sentences:
        seg["sentences"] = [{"start": s, "end": e, "text": t, "speaker_confidence": 0.9} for s, e, t in sentences]
    return seg


# Два диалога в кофейне подряд; абзац на стыке захватывает конец первого и начало второго
TWO_DIALOGS = [
    _seg(2.3, 4.0, "Добрый день, что будете пить?", 0),
    _seg(4.6, 6.0, "Латте, пожалуйста.", 1),
    _seg(26.8, 40.5, "С вас 410 рублей. Хорошего дня. Здравствуйте, слушаю вас.", 0, sentences=[
        (26.8, 28.5, "С вас 410 рублей."),
        (29.0, 30.2, "Хорошего дня."),
        (39.0, 40.5, "Здравствуйте, слушаю вас."),
    ]),
    _seg(41.6, 43.5, "Добрый день, американо, пожалуйста.", 1),
    _seg(44.4, 46.0, "С вас 200 рублей.", 0),
]


def test_boundary_inside_paragraph_splits_it_by_sentences():
    parts = plan_parts(TWO_DIALOGS, [{"start_ms": 2300, "end_ms": 30200}, {"start_ms": 39000, "end_ms": 46000}])
    assert len(parts) == 2
    first, second = parts
    assert (first["start_ms"], first["end_ms"]) == (0, 34600)  # середина паузы 30.2–39.0 с
    assert second["start_ms"] == 34600 and second["end_ms"] is None
    assert [s["text"] for s in first["segments"]] == [
        "Добрый день, что будете пить?", "Латте, пожалуйста.", "С вас 410 рублей.", "Хорошего дня.",
    ]
    assert [s["text"] for s in second["segments"]] == [
        "Здравствуйте, слушаю вас.", "Добрый день, американо, пожалуйста.", "С вас 200 рублей.",
    ]
    # время — от начала своего куска аудио, спикер сохраняется
    assert (second["segments"][0]["start_ms"], second["segments"][0]["speaker"]) == (39000 - 34600, 0)
    assert first["segments"][0]["start_ms"] == 2300


def test_paragraph_inside_one_conversation_stays_whole():
    segs = [
        _seg(0.0, 3.0, "Здравствуйте. Чем помочь?", 0, sentences=[(0.0, 1.0, "Здравствуйте."), (1.5, 3.0, "Чем помочь?")]),
        _seg(60.0, 62.0, "Добрый день.", 0),
    ]
    parts = plan_parts(segs, [{"start_ms": 0, "end_ms": 3000}, {"start_ms": 60000, "end_ms": 62000}])
    assert [s["text"] for s in parts[0]["segments"]] == ["Здравствуйте. Чем помочь?"]


@pytest.mark.parametrize("conversations", [
    [],
    [{"start_ms": 0, "end_ms": 46000}],
    # LLM нашла «второй» разговор, где нет ни одной реплики
    [{"start_ms": 0, "end_ms": 46000}, {"start_ms": 50000, "end_ms": 60000}],
    [{"start_ms": 0, "end_ms": 0}, {"start_ms": 0, "end_ms": 46000}],
])
def test_single_conversation_is_not_split(conversations):
    assert plan_parts(TWO_DIALOGS, conversations) == []


def test_unsorted_boundaries_are_ordered():
    parts = plan_parts(TWO_DIALOGS, [{"start_ms": 39000, "end_ms": 46000}, {"start_ms": 2300, "end_ms": 30200}])
    assert [len(p["segments"]) for p in parts] == [4, 3]


@pytest.mark.asyncio
async def test_segmentation_error_keeps_file_whole():
    with patch("app.conversation_split.httpx.AsyncClient.post", AsyncMock(side_effect=OSError("down"))):
        assert await find_conversations(TWO_DIALOGS) == []


@pytest.mark.parametrize("ext", [".ogg", ".mp3", ".wav"])
def test_cut_audio_keeps_format_and_length(ext):
    buf = io.BytesIO()
    Sine(440).to_audio_segment(duration=4000).export(buf, format=ext[1:])
    head = AudioSegment.from_file(io.BytesIO(cut_audio(buf.getvalue(), ext, 0, 1500)), format=ext[1:])
    tail = AudioSegment.from_file(io.BytesIO(cut_audio(buf.getvalue(), ext, 1500, None)), format=ext[1:])
    assert abs(len(head) - 1500) < 100
    assert abs(len(tail) - 2500) < 100
