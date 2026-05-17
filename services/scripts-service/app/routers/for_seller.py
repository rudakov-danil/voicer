import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ScriptTemplate, SellerScriptAssignment, StoreScriptAssignment, ScriptTemplateVersion

router = APIRouter(prefix="/api/v1/scripts", tags=["for-seller"])


def _serialize_template(t: ScriptTemplate, is_mandatory: bool, current_version_id: str | None) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "is_mandatory": is_mandatory,
        "context_description": t.context_description,
        "current_version_id": current_version_id,
        "steps": [
            {
                "id": str(s.id),
                "name": s.name,
                "description": s.description,
                "weight": float(s.weight),
                "is_required": s.is_required,
                "step_order": s.step_order,
                "recommendation_text": s.recommendation_text,
                "example_phrases": s.example_phrases or [],
            }
            for s in sorted(t.steps, key=lambda s: s.step_order)
        ],
    }


@router.get("/for-seller")
async def get_scripts_for_seller(
    seller_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID = Query(...),
    store_id: uuid.UUID | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает скрипты, применимые к (seller_id, store_id).

    Правило: скрипт применяется тогда и только тогда, когда выполнены ОБА условия:
      1. Скрипт «покрывает» магазин записи:
         - applies_to_all_stores=True, ИЛИ
         - есть store_script_assignment на этот store_id.
      2. Скрипт применим к этому продавцу:
         - в seller_script_assignments нет ни одной записи для этого template (=применяется ко всем
           продавцам покрытых магазинов), ИЛИ
         - в seller_script_assignments есть конкретно этот seller_id.

    Это исключает случаи, когда менеджера случайно отметили в чужом скрипте — без покрытия
    магазина скоринг не запускается.
    """
    if user["role"] != "service" and str(organization_id) != user["organization_id"]:
        return {"seller_id": seller_id, "scripts": []}

    async def _current_version_id(template_id: uuid.UUID) -> str | None:
        v = (await db.execute(
            select(ScriptTemplateVersion)
            .where(ScriptTemplateVersion.template_id == template_id)
            .order_by(ScriptTemplateVersion.version_number.desc())
            .limit(1)
        )).scalar_one_or_none()
        return str(v.id) if v else None

    # 1) Шаблоны, которые «покрывают» магазин записи.
    #    Без store_id невозможно выбрать ни один скрипт — для скоринга это OK.
    if store_id is None:
        return {"seller_id": seller_id, "scripts": []}

    # 1a) applies_to_all_stores=True — покрывают любой магазин организации.
    all_stores_q = (
        select(ScriptTemplate)
        .where(
            ScriptTemplate.organization_id == organization_id,
            ScriptTemplate.is_active == True,
            ScriptTemplate.applies_to_all_stores == True,
        )
        .options(selectinload(ScriptTemplate.steps))
    )
    all_stores_templates = (await db.execute(all_stores_q)).scalars().all()

    # 1b) Явно назначены на этот store.
    store_q = (
        select(StoreScriptAssignment)
        .where(
            StoreScriptAssignment.store_id == store_id,
            StoreScriptAssignment.organization_id == organization_id,
        )
        .join(ScriptTemplate)
        .where(ScriptTemplate.is_active == True)
        .options(selectinload(StoreScriptAssignment.template).selectinload(ScriptTemplate.steps))
    )
    store_assignments = (await db.execute(store_q)).scalars().all()

    # template_id -> (template, is_mandatory). Покрытые магазином — кандидаты.
    candidates: dict[uuid.UUID, tuple[ScriptTemplate, bool]] = {}
    for t in all_stores_templates:
        candidates[t.id] = (t, True)
    for a in store_assignments:
        existing = candidates.get(a.template.id)
        is_mand = a.is_mandatory or (existing[1] if existing else False)
        candidates[a.template.id] = (a.template, is_mand)

    if not candidates:
        return {"seller_id": seller_id, "scripts": []}

    # 2) Фильтр по продавцам: если у шаблона есть seller-assignments — нужен этот seller_id.
    template_ids = list(candidates.keys())
    seller_lists_q = (
        select(SellerScriptAssignment)
        .where(
            SellerScriptAssignment.template_id.in_(template_ids),
            SellerScriptAssignment.organization_id == organization_id,
        )
    )
    seller_rows = (await db.execute(seller_lists_q)).scalars().all()

    sellers_by_template: dict[uuid.UUID, set[uuid.UUID]] = {}
    seller_mandatory_by_template: dict[uuid.UUID, bool] = {}
    for r in seller_rows:
        sellers_by_template.setdefault(r.template_id, set()).add(r.seller_id)
        if r.seller_id == seller_id and r.is_mandatory:
            seller_mandatory_by_template[r.template_id] = True

    scripts = []
    for tid, (t, store_mand) in candidates.items():
        restricted_sellers = sellers_by_template.get(tid)
        if restricted_sellers is not None and seller_id not in restricted_sellers:
            # Шаблон ограничен списком продавцов, а этого продавца там нет.
            continue
        is_mand = store_mand or seller_mandatory_by_template.get(tid, False)
        ver_id = await _current_version_id(tid)
        scripts.append(_serialize_template(t, is_mand, ver_id))

    return {"seller_id": seller_id, "scripts": scripts}
