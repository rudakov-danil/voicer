"""Тесты метрик динамики разговора (app/dynamics.py) — чистые юниты, без БД и LLM."""
from app.dynamics import compute_dynamics


def seg(role: str, start_ms: int, end_ms: int) -> dict:
    return {"speaker_role": role, "start_ms": start_ms, "end_ms": end_ms}


def test_empty_segments():
    result = compute_dynamics([])
    assert result["talk_ratio"] is None
    assert result["interruptions_count"] is None
    assert result["longest_monologue_seconds"] is None
    assert result["silence_ratio"] is None


def test_single_segment_not_enough():
    result = compute_dynamics([seg("seller", 0, 5000)])
    assert result["talk_ratio"] is None


def test_talk_ratio_even_split():
    segments = [
        seg("seller", 0, 10_000),
        seg("customer", 10_000, 20_000),
    ]
    result = compute_dynamics(segments)
    assert result["talk_ratio"] == 0.5
    assert result["interruptions_count"] == 0
    assert result["silence_ratio"] == 0.0


def test_talk_ratio_seller_dominates():
    segments = [
        seg("seller", 0, 30_000),
        seg("customer", 30_000, 40_000),
    ]
    result = compute_dynamics(segments)
    assert result["talk_ratio"] == 0.75


def test_interruption_detected():
    # Клиент начинает говорить за 1 секунду до конца реплики продавца
    segments = [
        seg("seller", 0, 10_000),
        seg("customer", 9_000, 15_000),
    ]
    result = compute_dynamics(segments)
    assert result["interruptions_count"] == 1


def test_tiny_overlap_not_interruption():
    # Пересечение 100мс — погрешность таймкодов STT, не перебивание
    segments = [
        seg("seller", 0, 10_000),
        seg("customer", 9_900, 15_000),
    ]
    result = compute_dynamics(segments)
    assert result["interruptions_count"] == 0


def test_same_speaker_overlap_not_interruption():
    segments = [
        seg("seller", 0, 10_000),
        seg("seller", 9_000, 15_000),
        seg("customer", 15_000, 16_000),
    ]
    result = compute_dynamics(segments)
    assert result["interruptions_count"] == 0


def test_longest_monologue_merges_close_segments():
    # Реплики продавца с паузами < 3с считаются одним монологом
    segments = [
        seg("seller", 0, 10_000),
        seg("seller", 11_000, 20_000),   # пауза 1с — продолжение монолога
        seg("customer", 20_000, 22_000),  # клиент прерывает цепочку
        seg("seller", 22_000, 25_000),
    ]
    result = compute_dynamics(segments)
    assert result["longest_monologue_seconds"] == 20


def test_silence_ratio():
    # 10с речи, 10с тишины, 10с речи → тишина = 10/30
    segments = [
        seg("seller", 0, 10_000),
        seg("customer", 20_000, 30_000),
    ]
    result = compute_dynamics(segments)
    assert result["silence_ratio"] == round(10_000 / 30_000, 3)


def test_short_gaps_not_silence():
    # Пауза 1с — естественная смена реплик, не тишина
    segments = [
        seg("seller", 0, 10_000),
        seg("customer", 11_000, 20_000),
    ]
    result = compute_dynamics(segments)
    assert result["silence_ratio"] == 0.0


def test_synthetic_timings_safe():
    # Транскрипт без аудио: синтетические тайминги по 4с подряд — метрики не ломаются
    segments = [seg("seller" if i % 2 == 0 else "customer", i * 4000, (i + 1) * 4000) for i in range(10)]
    result = compute_dynamics(segments)
    assert result["talk_ratio"] == 0.5
    assert result["interruptions_count"] == 0
    assert result["silence_ratio"] == 0.0
