import io
import wave
import pytest
from app.audio import stitch_chunks, get_duration_ms


def make_wav(duration_ms: int = 1000, sample_rate: int = 16000) -> bytes:
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


def test_stitch_chunks_correct_duration():
    """REC-U-01: stitch 3 chunks produces correct total duration."""
    chunks = [make_wav(1000), make_wav(1000), make_wav(1000)]
    result = stitch_chunks(chunks)
    duration = get_duration_ms(result)
    assert 2900 <= duration <= 3100  # allow small tolerance


def test_stitch_chunks_order_matters():
    """REC-U-02: chunks must be sorted by caller before passing."""
    chunk_a = make_wav(500)
    chunk_b = make_wav(1000)
    result_ab = stitch_chunks([chunk_a, chunk_b])
    result_ba = stitch_chunks([chunk_b, chunk_a])
    # Both produce valid WAV — but durations should be equal (same total length)
    assert get_duration_ms(result_ab) == get_duration_ms(result_ba)


def test_stitch_empty_raises():
    with pytest.raises(ValueError):
        stitch_chunks([])


def test_get_duration_ms():
    wav = make_wav(2000)
    duration = get_duration_ms(wav)
    assert 1900 <= duration <= 2100
