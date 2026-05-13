"""Live-test endpoint: прогоняет ЧЕРНОВИК скрипта на существующей записи без сохранения.
Используется для отладки скриптов перед публикацией.
"""
import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from app.dependencies import get_current_user
from app.llm_client import get_llm_client
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scripts/test", tags=["test"])


class DraftStep(BaseModel):
    id: str | None = None  # необязательный, используется только для маркировки в ответе
    name: str
    description: str | None = None
    weight: float
    is_required: bool = True
    step_order: int
    example_phrases: list[str] = []


class TestRequest(BaseModel):
    recording_id: uuid.UUID
    name: str = "Черновик"
    steps: list[DraftStep]


SCRIPT_SCORING_SYSTEM_PROMPT = """Ты — эксперт по продажам в розничном магазине.
Тебе дан диаризованный транскрипт разговора продавца с клиентом.

Скрипт продаж «{script_name}» содержит следующие этапы:
{script_steps}

Проанализируй, насколько продавец соблюдал этот скрипт, и верни СТРОГО валидный JSON:
{{
  "step_scores": [
    {{
      "step_id": "<ID этапа>",
      "step_name": "<название этапа>",
      "score": <0—100>,
      "detected": <true|false>,
      "evidence": "<цитата из транскрипта или пустая строка>"
    }}
  ],
  "violations": ["<нарушение 1>", ...]
}}

Правила:
- score=0 если этап не был выполнен вообще
- detected=false если этап отсутствовал полностью
- evidence — прямая цитата из транскрипта, не перефразируй
"""


def _format_transcript(segments: list[dict], max_segments: int = 80) -> str:
    if len(segments) > max_segments:
        step = len(segments) / max_segments
        segments = [segments[int(i * step)] for i in range(max_segments)]
    lines = []
    for seg in segments:
        role = "ПРОДАВЕЦ" if seg.get("speaker_role") == "seller" else "КЛИЕНТ"
        time_s = (seg.get("start_ms") or 0) // 1000
        lines.append(f"{role} [{time_s}с]: {seg.get('text', '')}")
    return "Транскрипт разговора:\n" + "\n".join(lines)


def _format_step(step: DraftStep, idx: int) -> str:
    step_id = step.id or f"draft-{idx}"
    base = f"- ID={step_id} | {step.name} (вес {step.weight}): {step.description or ''}"
    if step.example_phrases:
        ex = "; ".join(f'«{e}»' for e in step.example_phrases if e)
        if ex:
            base += f"\n    Образцы формулировок: {ex}"
    return base


async def _fetch_segments(recording_id: uuid.UUID) -> list[dict]:
    """Тянет сегменты транскрипта из transcription-service service-to-service."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/transcripts/{recording_id}",
            headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Транскрипт не найден")
        resp.raise_for_status()
        data = resp.json()
        return data.get("segments", [])


@router.post("")
async def test_script_on_recording(
    body: TestRequest,
    user: dict = Depends(get_current_user),
):
    """Принимает черновик скрипта + recording_id, запускает scoring через LLM, возвращает результат.
    Ничего не сохраняет в БД — это инструмент отладки.
    """
    if not body.steps:
        raise HTTPException(status_code=422, detail="Скрипт должен иметь хотя бы один этап")

    # 1) Тянем транскрипт
    try:
        segments = await _fetch_segments(body.recording_id)
    except httpx.HTTPError as e:
        logger.error("Failed to fetch transcript for %s: %s", body.recording_id, e)
        raise HTTPException(status_code=502, detail="Не удалось получить транскрипт")

    if not segments:
        raise HTTPException(status_code=400, detail="Транскрипт пуст — выберите другую запись")

    # 2) Строим промт
    steps_sorted = sorted(body.steps, key=lambda s: s.step_order)
    steps_text = "\n".join(_format_step(s, i) for i, s in enumerate(steps_sorted))
    system = SCRIPT_SCORING_SYSTEM_PROMPT.format(
        script_name=body.name, script_steps=steps_text,
    )
    user_msg = _format_transcript(segments)

    # 3) Дёргаем LLM
    llm = get_llm_client()
    try:
        resp = await llm.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        raw = resp.choices[0].message.content
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LLM вернул невалидный JSON")
    except Exception as e:
        logger.exception("LLM test scoring failed")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    raw_step_scores = parsed.get("step_scores") or []
    violations = parsed.get("violations") or []

    # 4) Считаем итоговую оценку: сумма (score_i * weight_i) / 100 = доля
    by_id = {s.id or f"draft-{i}": s for i, s in enumerate(steps_sorted)}
    weighted_total = 0.0
    aligned: list[dict] = []
    for r in raw_step_scores:
        sid = str(r.get("step_id") or "")
        score = float(r.get("score") or 0)
        score = max(0.0, min(100.0, score))
        match = by_id.get(sid)
        weight = float(match.weight) if match else 0.0
        weighted_total += score * weight
        aligned.append({
            "step_id": sid,
            "step_name": r.get("step_name") or (match.name if match else ""),
            "score": round(score, 1),
            "detected": bool(r.get("detected")),
            "evidence": r.get("evidence") or "",
            "weight": round(weight, 3),
        })

    return {
        "overall_score": round(weighted_total, 1),
        "step_scores": aligned,
        "violations": violations,
        "segment_count": len(segments),
    }
