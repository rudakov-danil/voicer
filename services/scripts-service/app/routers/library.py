import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.library import LIBRARY, get_preset, list_presets
from app.llm_client import get_llm_client
from app.config import settings
from app.models import ScriptTemplate, ScriptStep
from app.routers.templates import _create_version
from app.validators import validate_weights_sum

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scripts/library", tags=["library"])


@router.get("")
async def get_library(user: dict = Depends(get_current_user)):
    """Список готовых шаблонов для быстрого старта."""
    return {"items": list_presets()}


@router.get("/{preset_id}")
async def get_library_preset(preset_id: str, user: dict = Depends(get_current_user)):
    """Полное содержимое пресета — для предпросмотра перед созданием."""
    p = get_preset(preset_id)
    if not p:
        raise HTTPException(status_code=404, detail="Preset not found")
    return p


@router.post("/{preset_id}/create", status_code=201)
async def create_from_preset(
    preset_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Создаёт новый шаблон у организации на основе пресета."""
    preset = get_preset(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    org_id = uuid.UUID(user["organization_id"])

    # Уникальность по (org, name) — если уже есть шаблон с таким именем, добавляем суффикс
    base_name = preset["name"]
    name = base_name
    suffix = 1
    while True:
        existing = (await db.execute(
            select(ScriptTemplate).where(
                ScriptTemplate.organization_id == org_id,
                ScriptTemplate.name == name,
            )
        )).scalar_one_or_none()
        if not existing:
            break
        suffix += 1
        name = f"{base_name} ({suffix})"

    template = ScriptTemplate(
        organization_id=org_id,
        name=name,
        description=preset.get("description"),
        scope="org_level",
        context_description=None,
        created_by=uuid.UUID(user["sub"]),
        is_active=False,  # черновик до явной активации
    )
    db.add(template)
    await db.flush()

    for i, s in enumerate(preset["steps"]):
        db.add(ScriptStep(
            template_id=template.id,
            name=s["name"],
            description=s.get("description"),
            weight=s["weight"],
            is_required=s.get("is_required", True),
            step_order=i + 1,
            recommendation_text=s.get("recommendation_text"),
            example_phrases=s.get("example_phrases") or [],
        ))

    await db.flush()
    seeded = (await db.execute(
        select(ScriptTemplate)
        .options(selectinload(ScriptTemplate.steps))
        .where(ScriptTemplate.id == template.id)
    )).scalar_one()
    await _create_version(db, seeded, user, note=f"from preset:{preset_id}")
    await db.commit()

    fresh = (await db.execute(
        select(ScriptTemplate)
        .options(
            selectinload(ScriptTemplate.steps),
            selectinload(ScriptTemplate.assignments),
            selectinload(ScriptTemplate.store_assignments),
        )
        .where(ScriptTemplate.id == template.id)
    )).scalar_one()

    return {
        "id": fresh.id,
        "name": fresh.name,
        "description": fresh.description,
        "scope": fresh.scope,
        "context_description": fresh.context_description,
        "is_active": fresh.is_active,
        "steps": [
            {
                "id": s.id, "name": s.name, "description": s.description,
                "weight": float(s.weight), "is_required": s.is_required,
                "step_order": s.step_order, "recommendation_text": s.recommendation_text,
                "example_phrases": s.example_phrases or [],
            } for s in fresh.steps
        ],
        "assigned_sellers": [],
        "assigned_stores": [],
    }


# ─── LLM generation ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    topic: str
    industry: str | None = None
    extra_notes: str | None = None


GENERATE_SYSTEM_PROMPT = """Ты — эксперт по построению скриптов продаж в розничном ритейле.
Тебе дают тему и/или индустрию, ты возвращаешь черновик скрипта продаж — структуру этапов.

Требования к ответу:
- 4–7 этапов, упорядоченных по логике диалога (от приветствия до закрытия).
- Сумма весов всех этапов = 1.000 (например 0.10 + 0.25 + 0.20 + 0.20 + 0.25 = 1.00).
- Для каждого этапа: имя, краткое описание (1-2 предложения), вес, обязательность, 2-3 эталонные фразы продавца, рекомендация продавцу.
- Эталонные фразы — реалистичные, как продавец действительно говорит, без воды.
- Описание этапа — что КОНКРЕТНО продавец должен сделать (не общими словами).

Верни СТРОГО валидный JSON в формате:
{
  "name": "<название скрипта>",
  "description": "<краткое описание для команды>",
  "steps": [
    {
      "name": "<имя этапа>",
      "description": "<что делает продавец>",
      "weight": <0.0—1.0>,
      "is_required": <true|false>,
      "example_phrases": ["<фраза 1>", "<фраза 2>"],
      "recommendation_text": "<подсказка продавцу или ''>"
    }
  ]
}
"""


@router.post("/generate")
async def generate_with_ai(
    body: GenerateRequest,
    user: dict = Depends(get_current_user),
):
    """LLM по описанию темы возвращает ЧЕРНОВИК шаблона (не сохраняется в БД).
    Фронт получает структуру, пользователь дорабатывает и сохраняет через обычный POST /templates.
    """
    if not body.topic.strip():
        raise HTTPException(status_code=422, detail="Topic is required")
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    user_msg = f"Тема скрипта: {body.topic.strip()}"
    if body.industry:
        user_msg += f"\nИндустрия / категория: {body.industry.strip()}"
    if body.extra_notes:
        user_msg += f"\nДополнительные пожелания: {body.extra_notes.strip()}"

    llm = get_llm_client()
    raw: str | None = None
    try:
        resp = await llm.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": GENERATE_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        raw = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.exception("LLM call failed")
        # APIStatusError несёт code/status — пробрасываем читаемое сообщение
        status_code = getattr(e, "status_code", None)
        if status_code:
            raise HTTPException(
                status_code=502,
                detail=f"LLM сервер вернул {status_code}: {getattr(e, 'message', str(e))}",
            )
        raise HTTPException(status_code=502, detail=f"LLM недоступен: {e}")

    # LLM иногда оборачивает JSON в ```json … ``` или вставляет преамбулу.
    # Пытаемся аккуратно достать JSON-объект перед парсингом.
    json_text = raw
    if json_text.startswith("```"):
        # снимаем код-блок
        json_text = json_text.strip("`")
        # язык на первой строке
        first_nl = json_text.find("\n")
        if first_nl > 0 and not json_text[:first_nl].strip().startswith("{"):
            json_text = json_text[first_nl + 1:]
        json_text = json_text.rstrip("`").strip()
    # Если есть текст до/после JSON — вырезаем по фигурным скобкам
    if not json_text.startswith("{"):
        i = json_text.find("{")
        j = json_text.rfind("}")
        if i >= 0 and j > i:
            json_text = json_text[i:j + 1]

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON: %s\nRaw output:\n%s", e, raw)
        raise HTTPException(
            status_code=502,
            detail="LLM вернула невалидный JSON. Попробуйте уточнить тему и повторить.",
        )

    # Нормализация и валидация
    if not isinstance(data, dict) or "steps" not in data:
        raise HTTPException(
            status_code=502,
            detail="В ответе LLM нет поля 'steps'. Попробуйте уточнить тему и повторить.",
        )

    steps_in = data.get("steps") or []
    if not steps_in or len(steps_in) < 2:
        raise HTTPException(
            status_code=502,
            detail="LLM вернула слишком мало этапов. Попробуйте дать более подробную тему.",
        )

    # Если веса не суммируются в 1 — нормализуем
    weights = [float(s.get("weight") or 0) for s in steps_in]
    weights_sum = sum(weights) or 1.0
    normalized_steps = []
    for i, s in enumerate(steps_in):
        w = float(s.get("weight") or 0) / weights_sum
        normalized_steps.append({
            "name": str(s.get("name") or f"Этап {i+1}").strip()[:255],
            "description": (s.get("description") or "")[:2000],
            "weight": round(w, 3),
            "is_required": bool(s.get("is_required", True)),
            "step_order": i + 1,
            "example_phrases": [p for p in (s.get("example_phrases") or []) if isinstance(p, str) and p.strip()],
            "recommendation_text": (s.get("recommendation_text") or "")[:2000] or None,
        })

    # фикс остатка из-за округления
    drift = round(1.0 - sum(s["weight"] for s in normalized_steps), 3)
    if abs(drift) > 0.001 and normalized_steps:
        normalized_steps[-1]["weight"] = round(normalized_steps[-1]["weight"] + drift, 3)

    if not validate_weights_sum([s["weight"] for s in normalized_steps]):
        # на всякий — последняя страховка
        equal = round(1.0 / len(normalized_steps), 3)
        for s in normalized_steps:
            s["weight"] = equal
        normalized_steps[-1]["weight"] = round(1.0 - equal * (len(normalized_steps) - 1), 3)

    return {
        "name": (data.get("name") or body.topic).strip()[:255],
        "description": (data.get("description") or "")[:2000],
        "steps": normalized_steps,
    }
