import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.library import get_preset
from app.models import ComplianceRule, CrossSellRule, ObjectionType, ScriptStep, ScriptTemplate, UpsellRule
from app.routers.objection_types import _ensure_seeded
from app.routers.templates import _create_version
from app.verticals import get_vertical, list_verticals

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scripts/verticals", tags=["verticals"])


class InstallRequest(BaseModel):
    # Скрипт сразу активен и применяется ко всем магазинам; False — черновик, как пресет из библиотеки
    activate_script: bool = True
    # Записать отрасль организации (auth.organizations.industry) — промпты анализа подстроятся под неё
    set_industry: bool = True


@router.get("")
async def get_verticals(user: dict = Depends(get_current_user)):
    """Отраслевые пакеты для быстрого старта."""
    return {"items": list_verticals()}


@router.get("/{code}")
async def get_vertical_detail(code: str, user: dict = Depends(get_current_user)):
    """Полное содержимое пакета — для предпросмотра перед установкой."""
    v = get_vertical(code)
    if not v:
        raise HTTPException(status_code=404, detail="Vertical not found")
    return {**v, "script": get_preset(v["script_preset"])}


@router.post("/{code}/install")
async def install_vertical(
    code: str,
    body: InstallRequest | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Устанавливает пакет в организацию. Повторная установка ничего не дублирует.

    Возвращает, что создано и что пропущено, потому что уже было.
    """
    body = body or InstallRequest()
    v = get_vertical(code)
    if not v:
        raise HTTPException(status_code=404, detail="Vertical not found")
    if user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can install an industry pack")

    org_id = uuid.UUID(user["organization_id"])
    author = uuid.UUID(user["sub"])
    # Стандартные 7 типов возражений (если справочник ещё пуст) — до остальных изменений:
    # сидинг коммитит сам и при гонке откатывает сессию
    await _ensure_seeded(db, org_id)
    created: dict = {"script": None, "upsell_rules": 0, "cross_sell_rules": 0,
                     "objection_types": 0, "compliance_rules": 0}
    skipped: dict = {"script": None, "upsell_rules": 0, "cross_sell_rules": 0,
                     "objection_types": 0, "compliance_rules": 0}

    # 1. Скрипт из библиотеки
    preset = get_preset(v["script_preset"])
    existing = (await db.execute(select(ScriptTemplate).where(
        ScriptTemplate.organization_id == org_id, ScriptTemplate.name == preset["name"],
    ))).scalar_one_or_none()
    if existing:
        skipped["script"] = {"id": str(existing.id), "name": existing.name}
    else:
        template = ScriptTemplate(
            organization_id=org_id,
            name=preset["name"],
            description=preset.get("description"),
            scope="org_level",
            is_active=body.activate_script,
            applies_to_all_stores=body.activate_script,
            created_by=author,
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
                recommendation_text=s.get("recommendation_text") or None,
                example_phrases=s.get("example_phrases") or [],
            ))
        await db.flush()
        seeded = (await db.execute(
            select(ScriptTemplate)
            .options(selectinload(ScriptTemplate.steps), selectinload(ScriptTemplate.blocks))
            .where(ScriptTemplate.id == template.id)
        )).scalar_one()
        await _create_version(db, seeded, user, note=f"from vertical:{code}")
        created["script"] = {"id": str(template.id), "name": template.name}

    # 2. Правила апсейла и кросс-сейла: уровень организации, все продавцы
    for key, model in (("upsell_rules", UpsellRule), ("cross_sell_rules", CrossSellRule)):
        have = {t.lower() for t in (await db.execute(
            select(model.trigger_product).where(model.organization_id == org_id)
        )).scalars().all()}
        for r in v[key]:
            if r["trigger_product"].lower() in have:
                skipped[key] += 1
                continue
            db.add(model(
                organization_id=org_id, store_ids=[], seller_ids=[],
                trigger_product=r["trigger_product"], required_offers=r["required_offers"],
                is_active=True, created_by=author,
            ))
            created[key] += 1

    # 3. Отраслевые типы возражений
    codes = set((await db.execute(
        select(ObjectionType.code).where(ObjectionType.organization_id == org_id)
    )).scalars().all())
    for t in v["objection_types"]:
        if t["code"] in codes:
            skipped["objection_types"] += 1
            continue
        db.add(ObjectionType(
            organization_id=org_id, code=t["code"], label=t["label"], description=t["description"],
            example_phrases=t["example_phrases"], is_default=False, is_active=True, created_by=author,
        ))
        created["objection_types"] += 1

    # 4. Правила коммуникации
    titles = {t.lower() for t in (await db.execute(
        select(ComplianceRule.title).where(ComplianceRule.organization_id == org_id)
    )).scalars().all()}
    for r in v["compliance_rules"]:
        if r["title"].lower() in titles:
            skipped["compliance_rules"] += 1
            continue
        db.add(ComplianceRule(
            organization_id=org_id, title=r["title"], description=r["description"],
            severity=r["severity"], keywords=[], is_active=True, created_by=author,
        ))
        created["compliance_rules"] += 1

    await db.commit()

    # 5. Отрасль организации. Колонка появляется миграцией auth 0003; без неё пакет
    # всё равно установлен, просто промпты остаются общими.
    industry_set = False
    if body.set_industry:
        try:
            await db.execute(text("UPDATE auth.organizations SET industry = :code WHERE id = :org_id"),
                             {"code": code, "org_id": org_id})
            await db.commit()
            industry_set = True
        except Exception as e:
            await db.rollback()
            logger.warning("Could not set industry for org=%s: %s", org_id, e)

    return {"vertical": code, "created": created, "skipped": skipped, "industry_set": industry_set}
