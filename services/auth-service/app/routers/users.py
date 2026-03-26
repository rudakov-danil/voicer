from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import RefreshToken, RopStoreAssignment, User
from app.schemas import (
    ChangePasswordRequest,
    RopStoresRequest,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.organization_id == current_user["organization_id"])
    if role:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active == is_active)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    result = await db.execute(q.limit(limit).offset(offset))
    users = result.scalars().all()

    return {"items": [UserResponse.model_validate(u) for u in users], "total": total}


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    if body.role == "manager" and not body.store_id:
        raise HTTPException(status_code=400, detail="store_id is required for manager role")

    # Check email uniqueness within org
    result = await db.execute(
        select(User).where(
            User.organization_id == current_user["organization_id"],
            User.email == body.email,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists in this organization")

    user = User(
        organization_id=current_user["organization_id"],
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        first_name=body.first_name,
        last_name=body.last_name,
        store_id=body.store_id if body.role == "manager" else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    body: UserUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user["organization_id"],
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
    if body.store_id is not None:
        user.store_id = body.store_id
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
                .values(revoked=True)
            )

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/change-password")
async def change_password(
    user_id: UUID,
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user["organization_id"],
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_self = str(user_id) == current_user["sub"]
    is_admin = current_user["role"] in ("director", "admin")

    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if is_self and not is_admin:
        if not body.old_password:
            raise HTTPException(status_code=400, detail="old_password is required")
        if not verify_password(body.old_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid old password")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.password_hash = hash_password(body.new_password)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.commit()
    return {"message": "Password changed successfully"}


@router.post("/{user_id}/rop-stores")
async def set_rop_stores(
    user_id: UUID,
    body: RopStoresRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user["organization_id"],
            User.role == "rop",
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="ROP user not found")

    # Replace all assignments
    existing = await db.execute(
        select(RopStoreAssignment).where(RopStoreAssignment.rop_user_id == user_id)
    )
    for assignment in existing.scalars().all():
        await db.delete(assignment)

    for store_id in body.store_ids:
        db.add(RopStoreAssignment(
            rop_user_id=user_id,
            store_id=store_id,
            organization_id=current_user["organization_id"],
        ))

    await db.commit()
    return {"store_ids": [str(s) for s in body.store_ids]}
