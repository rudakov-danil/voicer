"""Метрики динамики разговора, вычисляемые из таймкодов сегментов — без LLM.

Стандартные метрики речевой аналитики для телефонии:
- talk_ratio: доля времени речи продавца/оператора от суммарного времени речи
- interruptions_count: число перебиваний (реплика одной стороны начинается
  до окончания реплики другой)
- longest_monologue_seconds: самый длинный непрерывный монолог оператора
- silence_ratio: доля тишины (паузы между репликами) от длительности разговора

Для транскриптов с синтетическими таймингами (прямая загрузка текста) перебивания
и тишина дадут нули — это ожидаемо и не ломает ничего.
"""
from __future__ import annotations

# Пауза между подряд идущими репликами одного спикера, при которой монолог
# считается непрерывным
MONOLOGUE_GAP_MS = 3000
# Минимальное пересечение, засчитываемое как перебивание (мс) — отсекает
# погрешности таймкодов STT
INTERRUPTION_MIN_OVERLAP_MS = 300
# Минимальная пауза, засчитываемая в тишину (мс)
SILENCE_MIN_GAP_MS = 1500


def compute_dynamics(segments: list[dict]) -> dict:
    """Принимает сегменты вида {speaker_role, start_ms, end_ms}.

    Возвращает {talk_ratio, interruptions_count, longest_monologue_seconds, silence_ratio}
    (любое поле может быть None, если данных недостаточно).
    """
    timed = [
        s for s in segments
        if s.get("start_ms") is not None and s.get("end_ms") is not None
        and s["end_ms"] > s["start_ms"]
    ]
    if len(timed) < 2:
        return {
            "talk_ratio": None,
            "interruptions_count": None,
            "longest_monologue_seconds": None,
            "silence_ratio": None,
        }

    timed = sorted(timed, key=lambda s: (s["start_ms"], s["end_ms"]))

    def _is_seller(seg: dict) -> bool:
        return (seg.get("speaker_role") or "").lower() == "seller"

    # ── talk_ratio ──
    seller_ms = sum(s["end_ms"] - s["start_ms"] for s in timed if _is_seller(s))
    total_speech_ms = sum(s["end_ms"] - s["start_ms"] for s in timed)
    talk_ratio = round(seller_ms / total_speech_ms, 3) if total_speech_ms > 0 else None

    # ── interruptions: следующая реплика другой стороны начинается до конца текущей ──
    interruptions = 0
    for prev, cur in zip(timed, timed[1:]):
        if _is_seller(prev) == _is_seller(cur):
            continue
        overlap = prev["end_ms"] - cur["start_ms"]
        if overlap >= INTERRUPTION_MIN_OVERLAP_MS:
            interruptions += 1

    # ── longest seller monologue: цепочка реплик продавца с паузами < MONOLOGUE_GAP_MS,
    #    не прерванная репликой клиента ──
    longest_ms = 0
    run_start: int | None = None
    run_end: int | None = None
    for seg in timed:
        if _is_seller(seg):
            if run_start is None or seg["start_ms"] - (run_end or 0) > MONOLOGUE_GAP_MS:
                run_start = seg["start_ms"]
            run_end = max(run_end or 0, seg["end_ms"])
            longest_ms = max(longest_ms, run_end - run_start)
        else:
            run_start = None
            run_end = None

    # ── silence_ratio: паузы без речи между репликами ──
    conversation_span = timed[-1]["end_ms"] - timed[0]["start_ms"]
    silence_ms = 0
    covered_until = timed[0]["start_ms"]
    for seg in timed:
        if seg["start_ms"] > covered_until:
            gap = seg["start_ms"] - covered_until
            if gap >= SILENCE_MIN_GAP_MS:
                silence_ms += gap
        covered_until = max(covered_until, seg["end_ms"])
    silence_ratio = round(silence_ms / conversation_span, 3) if conversation_span > 0 else None

    return {
        "talk_ratio": talk_ratio,
        "interruptions_count": interruptions,
        "longest_monologue_seconds": longest_ms // 1000,
        "silence_ratio": silence_ratio,
    }
