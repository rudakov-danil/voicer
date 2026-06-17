"""Справочник типов возражений организации.

7 стандартных типов сидируются лениво при первом обращении (это покрывает и уже
существующие организации). Директор/админ/менеджер может добавлять свои типы с
примерами фраз — LLM получает их в промпте общего анализа и классифицирует
возражения по кодам справочника. Стандартные типы нельзя удалить (исторические
данные ссылаются на их коды), но можно выключить или переименовать.
"""
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ObjectionType

router = APIRouter(prefix="/api/v1/scripts/objection-types", tags=["objection-types"])

# Стандартный набор — соответствует историческим значениям в analytics.objections.type
DEFAULT_TYPES: list[dict] = [
    {"code": "price", "label": "Цена", "description": "Дорого, не по карману, у конкурентов дешевле"},
    {"code": "quality", "label": "Качество", "description": "Сомнения в качестве товара или услуги, плохие отзывы"},
    {"code": "competitors", "label": "Конкуренты", "description": "Уже пользуется продуктом другой компании или собирается уйти к ней"},
    {"code": "timing", "label": "Время", "description": "Сейчас не время, отложим, после праздников/зарплаты"},
    {"code": "trust", "label": "Доверие", "description": "Не верит компании или предложению: «в чём подвох», «скрытые комиссии»"},
    {"code": "not_ready", "label": "Не готов", "description": "Надо подумать, посоветоваться, не готов решать сейчас"},
    {"code": "functionality", "label": "Функциональность", "description": "Продукт не подходит по характеристикам, не хватает функции"},
]

_CODE_RE = re.compile(r"[^a-z0-9_]+")

# Транслитерация для автогенерации кода из русского названия
_TRANSLIT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya", " ": "_", "-": "_",
})


def _slugify(label: str) -> str:
    s = label.lower().translate(_TRANSLIT)
    s = _CODE_RE.sub("", s).strip("_")
    return s[:30] or f"type_{uuid.uuid4().hex[:8]}"


class ObjectionTypeCreate(BaseModel):
    label: str
    code: str | None = None  # если не задан — генерируется из label
    description: str = ""
    example_phrases: list[str] = []
    is_active: bool = True


class ObjectionTypePatch(BaseModel):
    label: str | None = None
    description: str | None = None
    example_phrases: list[str] | None = None
    is_active: bool | None = None


def _serialize(t: ObjectionType) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "label": t.label,
        "description": t.description or "",
        "example_phrases": t.example_phrases or [],
        "is_default": t.is_default,
        "is_active": t.is_active,
        "created_at": t.created_at,
    }


def _resolve_org_id(user: dict, fallback: uuid.UUID | None = None) -> uuid.UUID:
    if user["role"] == "service":
        if fallback is None:
            raise HTTPException(status_code=400, detail="organization_id required for service calls")
        return fallback
    return uuid.UUID(user["organization_id"])


async def _ensure_seeded(db: AsyncSession, org_id: uuid.UUID) -> None:
    """Ленивый сидинг стандартных типов: если у организации нет ни одного типа —
    создаём 7 дефолтных. Покрывает и старые организации без отдельной миграции данных."""
    existing = (await db.execute(
        select(ObjectionType.id).where(ObjectionType.organization_id == org_id).limit(1)
    )).scalar_one_or_none()
    if existing is not None:
        return
    for d in DEFAULT_TYPES:
        db.add(ObjectionType(
            organization_id=org_id,
            code=d["code"],
            label=d["label"],
            description=d["description"],
            example_phrases=[],
            is_default=True,
        ))
    try:
        await db.commit()
    except IntegrityError:
        # Параллельный запрос успел засидировать — не страшно
        await db.rollback()


@router.get("")
async def list_types(
    organization_id: uuid.UUID | None = Query(default=None),
    only_active: bool = Query(default=False),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _resolve_org_id(user, organization_id)
    await _ensure_seeded(db, org_id)
    q = select(ObjectionType).where(ObjectionType.organization_id == org_id)
    if only_active:
        q = q.where(ObjectionType.is_active.is_(True))
    rows = (await db.execute(q.order_by(ObjectionType.is_default.desc(), ObjectionType.created_at))).scalars().all()
    return {"items": [_serialize(t) for t in rows], "total": len(rows)}


@router.post("", status_code=201)
async def create_type(
    body: ObjectionTypeCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="label required")

    org_id = uuid.UUID(user["organization_id"])
    await _ensure_seeded(db, org_id)

    code = (body.code or "").strip().lower()
    if code:
        if _CODE_RE.search(code) or len(code) > 30:
            raise HTTPException(status_code=400, detail="code: только a-z, 0-9, _ и не длиннее 30 символов")
    else:
        code = _slugify(label)

    t = ObjectionType(
        organization_id=org_id,
        code=code,
        label=label[:100],
        description=(body.description or "").strip(),
        example_phrases=[p.strip() for p in (body.example_phrases or []) if p and p.strip()],
        is_default=False,
        is_active=body.is_active,
        created_by=uuid.UUID(user["sub"]),
    )
    db.add(t)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Тип с кодом «{code}» уже существует")
    await db.refresh(t)
    return _serialize(t)


@router.patch("/{type_id}")
async def update_type(
    type_id: uuid.UUID,
    body: ObjectionTypePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = (await db.execute(select(ObjectionType).where(ObjectionType.id == type_id))).scalar_one_or_none()
    if t is None or str(t.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Objection type not found")
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    if body.label is not None:
        label = body.label.strip()
        if not label:
            raise HTTPException(status_code=400, detail="label cannot be empty")
        t.label = label[:100]
    if body.description is not None:
        t.description = body.description.strip()
    if body.example_phrases is not None:
        t.example_phrases = [p.strip() for p in body.example_phrases if p and p.strip()]
    if body.is_active is not None:
        t.is_active = body.is_active
    t.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(t)
    return _serialize(t)


@router.delete("/{type_id}", status_code=204)
async def delete_type(
    type_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = (await db.execute(select(ObjectionType).where(ObjectionType.id == type_id))).scalar_one_or_none()
    if t is None or str(t.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Objection type not found")
    if user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can delete")
    if t.is_default:
        raise HTTPException(
            status_code=400,
            detail="Стандартный тип нельзя удалить — выключите его (is_active=false)",
        )
    await db.delete(t)
    await db.commit()
