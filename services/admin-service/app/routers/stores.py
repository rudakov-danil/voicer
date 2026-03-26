from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Device, Seller, Store
from app.schemas import StoreCreateRequest, StoreListResponse, StoreResponse, StoreUpdateRequest

router = APIRouter(prefix="/api/v1/admin/stores", tags=["stores"])


def _apply_store_access(q, user: dict):
    role = user["role"]
    org_id = user["organization_id"]
    q = q.where(Store.organization_id == org_id)
    if role == "rop":
        rop_stores = user.get("rop_stores", [])
        q = q.where(Store.id.in_(rop_stores))
    elif role == "manager":
        q = q.where(Store.id == user["store_id"])
    return q


@router.get("", response_model=StoreListResponse)
async def list_stores(
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Store)
    q = _apply_store_access(q, current_user)
    if is_active is not None:
        q = q.where(Store.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    stores = (await db.execute(q.limit(limit).offset(offset))).scalars().all()

    items = []
    for store in stores:
        seller_count = (await db.execute(
            select(func.count()).where(Seller.store_id == store.id)
        )).scalar()
        device_count = (await db.execute(
            select(func.count()).where(Device.store_id == store.id)
        )).scalar()
        items.append(StoreResponse(
            id=store.id,
            organization_id=store.organization_id,
            name=store.name,
            address=store.address,
            is_active=store.is_active,
            seller_count=seller_count,
            device_count=device_count,
        ))

    return {"items": items, "total": total}


@router.post("", response_model=StoreResponse, status_code=201)
async def create_store(
    body: StoreCreateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(Store).where(
            Store.organization_id == current_user["organization_id"],
            Store.name == body.name,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Store with this name already exists")

    store = Store(
        organization_id=current_user["organization_id"],
        name=body.name,
        address=body.address,
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return StoreResponse(id=store.id, organization_id=store.organization_id, name=store.name,
                         address=store.address, is_active=store.is_active)


@router.get("/{store_id}", response_model=StoreResponse)
async def get_store(
    store_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Store).where(Store.id == store_id)
    q = _apply_store_access(q, current_user)
    store = (await db.execute(q)).scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    seller_count = (await db.execute(select(func.count()).where(Seller.store_id == store.id))).scalar()
    device_count = (await db.execute(select(func.count()).where(Device.store_id == store.id))).scalar()
    return StoreResponse(id=store.id, organization_id=store.organization_id, name=store.name,
                         address=store.address, is_active=store.is_active,
                         seller_count=seller_count, device_count=device_count)


@router.patch("/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: UUID,
    body: StoreUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    store = (await db.execute(
        select(Store).where(Store.id == store_id, Store.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if body.name is not None:
        store.name = body.name
    if body.address is not None:
        store.address = body.address
    if body.is_active is not None:
        store.is_active = body.is_active

    await db.commit()
    await db.refresh(store)
    return StoreResponse(id=store.id, organization_id=store.organization_id, name=store.name,
                         address=store.address, is_active=store.is_active)
