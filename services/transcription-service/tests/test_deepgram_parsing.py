import pytest

from app.deepgram_client import _parse_deepgram_response


def _word(word, start, end, speaker, conf):
    return {"word": word, "punctuated_word": word, "start": start, "end": end,
            "speaker": speaker, "speaker_confidence": conf}


def _payload(paragraphs, words):
    return {"results": {"channels": [{"detected_language": "ru", "alternatives": [{
        "transcript": "текст", "words": words, "paragraphs": {"paragraphs": paragraphs},
    }]}]}}


def test_low_confidence_paragraph_is_split_into_sentences():
    words = [
        _word("А", 15.0, 15.2, 1, 1.0), _word("если?", 15.2, 15.6, 1, 1.0),
        _word("Я", 18.98, 19.2, 2, 0.82), _word("думаю.", 19.2, 20.5, 2, 0.76),
        _word("Ладно,", 20.59, 20.8, 2, 0.76), _word("хорошо.", 20.8, 21.2, 2, 0.70),
    ]
    paragraphs = [
        {"speaker": 1, "start": 15.0, "end": 15.6, "sentences": [{"text": "А если?", "start": 15.0, "end": 15.6}]},
        {"speaker": 2, "start": 18.98, "end": 21.2, "sentences": [
            {"text": "Я думаю.", "start": 18.98, "end": 20.5},
            {"text": "Ладно, хорошо.", "start": 20.59, "end": 21.2},
        ]},
    ]
    segs = _parse_deepgram_response(_payload(paragraphs, words))["segments"]
    assert [(s["text"], s["speaker"], s["speaker_confidence"]) for s in segs] == [
        ("А если?", 1, 1.0),
        ("Я думаю.", 2, 0.79),
        ("Ладно, хорошо.", 2, 0.73),
    ]
    assert (segs[2]["start"], segs[2]["end"]) == (20.59, 21.2)


def test_confident_paragraph_stays_whole():
    words = [_word("Добрый", 0.0, 0.4, 0, 0.98), _word("день.", 0.4, 0.8, 0, 0.97),
             _word("Чем", 1.0, 1.2, 0, 0.99), _word("помочь?", 1.2, 1.6, 0, 0.99)]
    paragraphs = [{"speaker": 0, "start": 0.0, "end": 1.6, "sentences": [
        {"text": "Добрый день.", "start": 0.0, "end": 0.8},
        {"text": "Чем помочь?", "start": 1.0, "end": 1.6},
    ]}]
    segs = _parse_deepgram_response(_payload(paragraphs, words))["segments"]
    assert len(segs) == 1
    assert segs[0]["text"] == "Добрый день. Чем помочь?"
    assert segs[0]["speaker_confidence"] == pytest.approx(0.9825, abs=0.001)


def test_overlapping_paragraphs_take_only_own_speaker_words():
    # Абзацы разных спикеров пересекаются по времени: уверенность считается по словам своего спикера
    words = [_word("Да", 10.0, 10.3, 0, 0.99), _word("нет", 10.1, 10.4, 1, 0.5), _word("да.", 10.4, 10.8, 0, 0.99)]
    paragraphs = [
        {"speaker": 0, "start": 10.0, "end": 10.8, "sentences": [{"text": "Да да.", "start": 10.0, "end": 10.8}]},
        {"speaker": 1, "start": 10.1, "end": 10.4, "sentences": [{"text": "нет", "start": 10.1, "end": 10.4}]},
    ]
    segs = _parse_deepgram_response(_payload(paragraphs, words))["segments"]
    assert [s["speaker_confidence"] for s in segs] == [0.99, 0.5]


def test_no_speaker_confidence_from_deepgram():
    words = [{"word": "Привет", "start": 0.0, "end": 0.5, "speaker": 0}]
    paragraphs = [{"speaker": 0, "start": 0.0, "end": 0.5, "sentences": [{"text": "Привет.", "start": 0.0, "end": 0.5}]}]
    segs = _parse_deepgram_response(_payload(paragraphs, words))["segments"]
    assert segs[0]["speaker_confidence"] is None
