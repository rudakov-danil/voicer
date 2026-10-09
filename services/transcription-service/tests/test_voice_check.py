import numpy as np

from app.voice_check import clean_parts, resolve_by_voice

# Голоса двух людей — разные направления; сомнительные реплики Deepgram отдал лишнему кластеру 2.
# Как на записи с перебиванием: «Я думаю…» сказал спикер 0, «Ладно, хорошо…» — спикер 1.
VOICE = {0: np.array([1.0, 0.0]), 1: np.array([0.0, 1.0])}
SEGMENTS = [
    {"start_ms": 1000, "end_ms": 7000, "speaker_id": 0, "speaker_confidence": 1.0},
    {"start_ms": 7500, "end_ms": 18900, "speaker_id": 1, "speaker_confidence": 1.0},
    {"start_ms": 18980, "end_ms": 20590, "speaker_id": 2, "speaker_confidence": 0.77},
    {"start_ms": 20590, "end_ms": 30980, "speaker_id": 2, "speaker_confidence": 0.75},
    {"start_ms": 30060, "end_ms": 31000, "speaker_id": 2, "speaker_confidence": 0.69},
]
TRUE_SPEAKER = {(1000, 7000): 0, (7500, 18900): 1, (18980, 20590): 0, (20590, 30060): 1}


def fake_embed(parts):
    """Отпечаток — смесь голосов по длительности кусков; тишина (неизвестный кусок) не даёт голоса."""
    vec = np.zeros(2)
    for a, b in parts:
        for (s, e), sid in TRUE_SPEAKER.items():
            overlap = min(b, e) - max(a, s)
            if overlap > 0:
                vec += VOICE[sid] * overlap
    norm = np.linalg.norm(vec)
    return vec / norm if norm else None


def test_clean_parts_cut_overlaps():
    segs = [{"start_ms": 0, "end_ms": 5000}, {"start_ms": 4000, "end_ms": 9000}, {"start_ms": 6000, "end_ms": 7000}]
    assert clean_parts(segs, 0) == [(0, 4000)]
    assert clean_parts(segs, 1) == [(5000, 6000), (7000, 9000)]
    assert clean_parts(segs, 2) == []


def test_resolve_by_voice_moves_interrupted_lines():
    ids, details = resolve_by_voice(SEGMENTS, fake_embed)
    assert ids[:4] == [0, 1, 0, 1]
    assert details[2][0] == "voice" and details[3][0] == "voice"


def test_undecided_line_of_extra_cluster_takes_previous_speaker():
    # У последней реплики без перекрытия звука нет (только тишина) — голос не решает,
    # а кластер 2 лишний, поэтому берётся спикер предыдущей реплики
    ids, details = resolve_by_voice(SEGMENTS, fake_embed)
    assert details[4][0] == "undecided"
    assert ids[4] == 1


def test_undecided_line_keeps_real_deepgram_speaker():
    segs = [dict(s) for s in SEGMENTS]
    segs[4]["speaker_id"] = 0
    ids, _ = resolve_by_voice(segs, fake_embed)
    assert ids[4] == 0


def test_nothing_to_check_without_uncertain_lines():
    segs = [dict(s, speaker_confidence=1.0) for s in SEGMENTS]
    calls = []
    ids, details = resolve_by_voice(segs, lambda parts: calls.append(parts))
    assert ids == [0, 1, 2, 2, 2] and details == {} and calls == []


def test_skips_when_one_speaker_has_no_confident_audio():
    segs = [dict(s) for s in SEGMENTS]
    segs[1]["speaker_confidence"] = 0.5
    ids, details = resolve_by_voice(segs, fake_embed)
    assert ids == [0, 1, 2, 2, 2]
    assert details == {}
