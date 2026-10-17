"""Разбиение ручной загрузки на отдельные разговоры.

Границы ищет LLM в transcription-service (segment_conversations — та же, что у записей бейджа).
Здесь — нарезка: каждая реплика уходит в разговор, на который приходится её середина.
Абзац Deepgram, на который пришлась граница («…хорошего дня. Здравствуйте, слушаю вас»),
режется на предложения; остальные абзацы остаются целыми.
"""
import io
import logging

import httpx
from pydub import AudioSegment

from app.config import settings

logger = logging.getLogger(__name__)


def _units(segments: list[dict]) -> list[dict]:
    """Мельчайшие куски с временем: предложения абзацев, иначе сами сегменты.
    parent — индекс исходного сегмента, чтобы потом собрать абзац обратно."""
    units = []
    for i, seg in enumerate(segments):
        sents = seg.get("sentences") or []
        if len(sents) > 1:
            for s in sents:
                units.append({**s, "speaker": seg.get("speaker"), "parent": i})
        else:
            units.append({**seg, "parent": i})
    return [u for u in units if (u.get("text") or "").strip()]


def _cut_points(conversations: list[dict]) -> list[int]:
    """Точки разреза (мс) между соседними разговорами: середина паузы между ними."""
    convs = sorted(
        (c for c in conversations if int(c["end_ms"]) > int(c["start_ms"])),
        key=lambda c: int(c["start_ms"]),
    )
    cuts = []
    for prev, cur in zip(convs, convs[1:]):
        prev_end, cur_start = int(prev["end_ms"]), int(cur["start_ms"])
        cut = (prev_end + cur_start) // 2 if prev_end <= cur_start else cur_start
        if cut > 0 and (not cuts or cut > cuts[-1]):
            cuts.append(cut)
    return cuts


def plan_parts(segments: list[dict], conversations: list[dict]) -> list[dict]:
    """Делит сегменты Deepgram (секунды) на разговоры по границам LLM (мс).

    Возвращает [{"start_ms", "end_ms" (None — до конца файла), "segments": [...]}]:
    сегменты в формате БД, время — от начала своего куска аудио.
    Меньше двух непустых разговоров — пустой список: файл остаётся одной записью.
    """
    cuts = _cut_points(conversations)
    if not cuts:
        return []
    bounds = list(zip([0] + cuts, cuts + [None]))

    def part_of(unit: dict) -> int:
        mid = (float(unit.get("start", 0)) + float(unit.get("end", 0))) * 500
        return sum(1 for c in cuts if mid >= c)

    units = _units(segments)
    placed = [(part_of(u), u) for u in units]
    parts_by_parent: dict[int, set[int]] = {}
    for k, u in placed:
        parts_by_parent.setdefault(u["parent"], set()).add(k)

    out = [{"start_ms": s, "end_ms": e, "segments": []} for s, e in bounds]
    emitted: set[int] = set()
    for k, u in placed:
        parent = u["parent"]
        if len(parts_by_parent[parent]) == 1:
            if parent in emitted:
                continue
            emitted.add(parent)
            src = segments[parent]  # абзац целиком в одном разговоре — как был
        else:
            src = u
        offset = out[k]["start_ms"]
        out[k]["segments"].append({
            "text": src["text"].strip(),
            "start_ms": max(0, int(float(src.get("start", 0)) * 1000) - offset),
            "end_ms": max(0, int(float(src.get("end", 0)) * 1000) - offset),
            "speaker": src.get("speaker"),
            "speaker_confidence": src.get("speaker_confidence"),
        })

    parts = [p for p in out if p["segments"]]
    return parts if len(parts) > 1 else []


async def find_conversations(segments: list[dict]) -> list[dict]:
    """Границы разговоров от transcription-service; при любой ошибке — пусто (файл не режем)."""
    units = [{"start": float(u.get("start", 0)), "end": float(u.get("end", 0)), "text": u["text"]}
             for u in _units(segments)]
    if not units:
        return []
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/internal/segment-conversations",
                json={"segments": units},
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
        resp.raise_for_status()
        return resp.json().get("conversations") or []
    except Exception as e:
        logger.warning(f"Conversation segmentation unavailable, keeping file whole: {e}")
        return []


def cut_audio(audio_bytes: bytes, ext: str, start_ms: int, end_ms: int | None) -> bytes:
    """Кусок аудио в том же формате, что и исходный файл (.wav/.mp3/.ogg)."""
    fmt = ext.lstrip(".") or "wav"
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
    buf = io.BytesIO()
    audio[start_ms:end_ms].export(buf, format=fmt)
    return buf.getvalue()
