from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Seller, Store
from app.schemas import SellerCreateRequest, SellerListResponse, SellerResponse, SellerUpdateRequest

router = APIRouter(prefix="/api/v1/admin/sellers", tags=["sellers"])


def _apply_seller_access(q, user: dict):
    role = user["role"]
    q = q.where(Seller.organization_id == user["organization_id"])
    if role == "rop":
        q = q.where(Seller.store_id.in_(user.get("rop_stores", [])))
    elif role == "manager":
        q = q.where(Seller.store_id == user["store_id"])
    return q


@router.get("", response_model=SellerListResponse)
async def list_sellers(
    store_id: UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Seller)
    q = _apply_seller_access(q, current_user)
    if store_id:
        q = q.where(Seller.store_id == store_id)
    if is_active is not None:
        q = q.where(Seller.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    sellers = (await db.execute(q.limit(limit).offset(offset))).scalars().all()

    items = []
    for seller in sellers:
        store = (await db.execute(select(Store).where(Store.id == seller.store_id))).scalar_one_or_none()
        items.append(SellerResponse(
            id=seller.id,
            organization_id=seller.organization_id,
            store_id=seller.store_id,
            store_name=store.name if store else None,
            first_name=seller.first_name,
            last_name=seller.last_name,
            is_active=seller.is_active,
        ))

    return {"items": items, "total": total}


@router.post("", response_model=SellerResponse, status_code=201)
async def create_seller(
    body: SellerCreateRequest,
    current_user: dict = Depends(require_role("director", "admin", "manager")),
    db: AsyncSession = Depends(get_db),
):
    # manager can only add to their own store
    if current_user["role"] == "manager" and str(body.store_id) != current_user.get("store_id"):
        raise HTTPException(status_code=403, detail="Manager can only add sellers to their own store")

    # verify store belongs to org
    store = (await db.execute(
        select(Store).where(Store.id == body.store_id, Store.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    seller = Seller(
        organization_id=current_user["organization_id"],
        store_id=body.store_id,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    db.add(seller)
    await db.commit()
    await db.refresh(seller)
    return SellerResponse(
        id=seller.id, organization_id=seller.organization_id, store_id=seller.store_id,
        store_name=store.name, first_name=seller.first_name, last_name=seller.last_name,
        is_active=seller.is_active,
    )


@router.get("/{seller_id}", response_model=SellerResponse)
async def get_seller(
    seller_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Seller).where(Seller.id == seller_id)
    if current_user["role"] != "service":
        q = q.where(Seller.organization_id == current_user["organization_id"])
    seller = (await db.execute(q)).scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    store = (await db.execute(select(Store).where(Store.id == seller.store_id))).scalar_one_or_none()
    return SellerResponse(
        id=seller.id, organization_id=seller.organization_id, store_id=seller.store_id,
        store_name=store.name if store else None, first_name=seller.first_name,
        last_name=seller.last_name, is_active=seller.is_active,
    )


@router.patch("/{seller_id}", response_model=SellerResponse)
async def update_seller(
    seller_id: UUID,
    body: SellerUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin", "manager")),
    db: AsyncSession = Depends(get_db),
):
    seller = (await db.execute(
        select(Seller).where(Seller.id == seller_id, Seller.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    if current_user["role"] == "manager" and str(seller.store_id) != current_user.get("store_id"):
        raise HTTPException(status_code=403, detail="Manager can only edit sellers from their own store")

    if body.first_name is not None:
        seller.first_name = body.first_name
    if body.last_name is not None:
        seller.last_name = body.last_name
    if body.is_active is not None:
        seller.is_active = body.is_active

    await db.commit()
    await db.refresh(seller)
    store = (await db.execute(select(Store).where(Store.id == seller.store_id))).scalar_one_or_none()
    return SellerResponse(
        id=seller.id, organization_id=seller.organization_id, store_id=seller.store_id,
        store_name=store.name if store else None, first_name=seller.first_name,
        last_name=seller.last_name, is_active=seller.is_active,
    )
