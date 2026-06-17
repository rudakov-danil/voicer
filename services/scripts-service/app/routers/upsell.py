import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.dependencies import get_current_user
from app.models import UpsellRule
from app.schemas import UpsellRuleCreate, UpsellRulePatch

router = APIRouter(prefix="/api/v1/scripts/upsell-rules", tags=["upsell-rules"])


def _serialize(rule: UpsellRule) -> dict:
    return {
        "id": rule.id,
        "organization_id": rule.organization_id,
        "store_ids": rule.store_ids or [],
        "seller_ids": rule.seller_ids or [],
        "trigger_product": rule.trigger_product,
        "required_offers": rule.required_offers,
        "is_active": rule.is_active,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


def _resolve_org_id(user: dict, fallback: uuid.UUID | None = None) -> uuid.UUID:
    """Org берётся из токена; для сервисных вызовов (роль service, org=None) —
    из query-параметра organization_id."""
    if user["role"] == "service":
        if fallback is None:
            raise HTTPException(status_code=400, detail="organization_id required for service calls")
        return fallback
    return uuid.UUID(user["organization_id"])


@router.get("")
async def list_rules(
    store_id: uuid.UUID | None = Query(default=None),
    seller_id: uuid.UUID | None = Query(default=None),
    include_org_default: bool = Query(default=True),
    organization_id: uuid.UUID | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _resolve_org_id(user, organization_id)
    q = select(UpsellRule).where(UpsellRule.organization_id == org_id)
    # Фильтр по магазину: правило покрывает магазин, если store_ids пуст (вся
    # организация) ИЛИ store_id входит в store_ids. include_org_default=False —
    # только правила, явно назначенные на этот магазин.
    if store_id is not None:
        covers_store = UpsellRule.store_ids.any(store_id)
        if include_org_default:
            q = q.where((func.cardinality(UpsellRule.store_ids) == 0) | covers_store)
        else:
            q = q.where(covers_store)
    # Фильтр по продавцу: правило применимо, если seller_ids пуст (все продавцы)
    # ИЛИ seller_id входит в seller_ids.
    if seller_id is not None:
        q = q.where((func.cardinality(UpsellRule.seller_ids) == 0) | UpsellRule.seller_ids.any(seller_id))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    # Порядок создания (новое правило — в конец списка), стабильный tiebreak по id.
    rules = (await db.execute(
        q.order_by(UpsellRule.created_at.asc(), UpsellRule.id.asc())
    )).scalars().all()
    return {"items": [_serialize(r) for r in rules], "total": total}


@router.post("", status_code=201)
async def create_rule(
    body: UpsellRuleCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    rule = UpsellRule(
        organization_id=uuid.UUID(user["organization_id"]),
        store_ids=body.store_ids or [],
        seller_ids=body.seller_ids or [],
        trigger_product=body.trigger_product.strip(),
        required_offers=[o.strip() for o in body.required_offers if o and o.strip()],
        is_active=body.is_active,
        created_by=uuid.UUID(user["sub"]),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.patch("/{rule_id}")
async def update_rule(
    rule_id: uuid.UUID,
    body: UpsellRulePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(select(UpsellRule).where(UpsellRule.id == rule_id))).scalar_one_or_none()
    if rule is None or str(rule.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Rule not found")
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    if body.store_ids is not None:
        rule.store_ids = body.store_ids
    if body.seller_ids is not None:
        rule.seller_ids = body.seller_ids
    if body.trigger_product is not None:
        rule.trigger_product = body.trigger_product.strip()
    if body.required_offers is not None:
        rule.required_offers = [o.strip() for o in body.required_offers if o and o.strip()]
    if body.is_active is not None:
        rule.is_active = body.is_active
    rule.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(select(UpsellRule).where(UpsellRule.id == rule_id))).scalar_one_or_none()
    if rule is None or str(rule.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Rule not found")
    if user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can delete")

    await db.delete(rule)
    await db.commit()
