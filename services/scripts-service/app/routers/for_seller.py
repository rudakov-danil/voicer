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
    """Возвращает все скрипты, которые должны быть применены к продавцу:
    - назначенные лично на продавца (seller_script_assignments)
    - назначенные на его магазин (store_script_assignments), если передан store_id
    Если один и тот же шаблон назначен и на магазин, и на продавца — он отдаётся один раз,
    is_mandatory = OR из обоих источников.
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

    # 1) seller-level
    seller_q = (
        select(SellerScriptAssignment)
        .where(
            SellerScriptAssignment.seller_id == seller_id,
            SellerScriptAssignment.organization_id == organization_id,
        )
        .join(ScriptTemplate)
        .where(ScriptTemplate.is_active == True)
        .options(selectinload(SellerScriptAssignment.template).selectinload(ScriptTemplate.steps))
    )
    seller_assignments = (await db.execute(seller_q)).scalars().all()

    # template_id -> (template, is_mandatory)
    merged: dict[uuid.UUID, tuple[ScriptTemplate, bool]] = {}
    for a in seller_assignments:
        merged[a.template.id] = (a.template, a.is_mandatory)

    # 2) store-level (если знаем store)
    if store_id is not None:
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
        for a in store_assignments:
            if a.template.id in merged:
                _, existing_mand = merged[a.template.id]
                merged[a.template.id] = (a.template, existing_mand or a.is_mandatory)
            else:
                merged[a.template.id] = (a.template, a.is_mandatory)

    scripts = []
    for (t, m) in merged.values():
        ver_id = await _current_version_id(t.id)
        scripts.append(_serialize_template(t, m, ver_id))
    return {"seller_id": seller_id, "scripts": scripts}
