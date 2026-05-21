import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ComplianceRule
from app.schemas import ComplianceRuleCreate, ComplianceRulePatch

router = APIRouter(prefix="/api/v1/scripts/compliance-rules", tags=["compliance-rules"])

_ALLOWED_SEVERITIES = {"high", "medium", "low"}


def _serialize(rule: ComplianceRule) -> dict:
    return {
        "id": rule.id,
        "organization_id": rule.organization_id,
        "title": rule.title,
        "description": rule.description or "",
        "severity": rule.severity,
        "keywords": rule.keywords or [],
        "is_active": rule.is_active,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


def _normalize_severity(value: str) -> str:
    v = (value or "medium").lower()
    if v not in _ALLOWED_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"severity must be one of {sorted(_ALLOWED_SEVERITIES)}")
    return v


def _resolve_org_id(user: dict, fallback: uuid.UUID | None = None) -> uuid.UUID:
    if user["role"] == "service":
        if fallback is None:
            raise HTTPException(status_code=400, detail="organization_id required for service calls")
        return fallback
    return uuid.UUID(user["organization_id"])


@router.get("")
async def list_rules(
    organization_id: uuid.UUID | None = Query(default=None),
    only_active: bool = Query(default=False),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _resolve_org_id(user, organization_id)
    q = select(ComplianceRule).where(ComplianceRule.organization_id == org_id)
    if only_active:
        q = q.where(ComplianceRule.is_active.is_(True))
    rules = (await db.execute(q.order_by(ComplianceRule.created_at))).scalars().all()
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    return {"items": [_serialize(r) for r in rules], "total": total}


@router.post("", status_code=201)
async def create_rule(
    body: ComplianceRuleCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")

    rule = ComplianceRule(
        organization_id=uuid.UUID(user["organization_id"]),
        title=title,
        description=(body.description or "").strip(),
        severity=_normalize_severity(body.severity),
        keywords=[k.strip() for k in (body.keywords or []) if k and k.strip()],
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
    body: ComplianceRulePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(select(ComplianceRule).where(ComplianceRule.id == rule_id))).scalar_one_or_none()
    if rule is None or str(rule.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Rule not found")
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        rule.title = title
    if body.description is not None:
        rule.description = body.description.strip()
    if body.severity is not None:
        rule.severity = _normalize_severity(body.severity)
    if body.keywords is not None:
        rule.keywords = [k.strip() for k in body.keywords if k and k.strip()]
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
    rule = (await db.execute(select(ComplianceRule).where(ComplianceRule.id == rule_id))).scalar_one_or_none()
    if rule is None or str(rule.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Rule not found")
    if user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can delete")

    await db.delete(rule)
    await db.commit()
