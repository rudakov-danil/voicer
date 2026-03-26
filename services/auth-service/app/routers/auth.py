from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_super_admin
from app.models import Organization, RefreshToken, RopStoreAssignment, SuperAdmin, User
from app.schemas import (
    ChangePasswordRequest,
    CreateOrganizationRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
    VerifyResponse,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from jose import JWTError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


async def _get_rop_stores(db: AsyncSession, user_id, organization_id) -> list[str]:
    result = await db.execute(
        select(RopStoreAssignment.store_id).where(
            RopStoreAssignment.rop_user_id == user_id,
            RopStoreAssignment.organization_id == organization_id,
        )
    )
    return [str(r.store_id) for r in result.fetchall()]


async def _build_token_response(db: AsyncSession, user: User) -> dict:
    rop_stores = []
    if user.role == "rop":
        rop_stores = await _get_rop_stores(db, user.id, user.organization_id)

    access_payload = {
        "sub": str(user.id),
        "organization_id": str(user.organization_id),
        "role": user.role,
        "store_id": str(user.store_id) if user.store_id else None,
        "rop_stores": rop_stores,
    }
    access_token = create_access_token(access_payload)
    refresh_token_str, jti = create_refresh_token(str(user.id))

    token_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_password(refresh_token_str),
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(token_record)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "expires_in": 900,
        "user": UserResponse.model_validate(user),
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    return await _build_token_response(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    # Find the token record - we stored bcrypt hash, so we need to check all non-revoked tokens for this user
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == payload["sub"],
            RefreshToken.revoked == False,
        )
    )
    token_records = result.scalars().all()

    matching_record = None
    for record in token_records:
        if verify_password(body.refresh_token, record.token_hash):
            matching_record = record
            break

    if not matching_record:
        raise HTTPException(status_code=401, detail="Refresh token not found or already revoked")

    # Revoke old token
    matching_record.revoked = True
    await db.flush()

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return await _build_token_response(db, user)


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user["sub"], RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.commit()
    return {"message": "Logged out successfully"}


@router.get("/verify", response_model=VerifyResponse)
async def verify(current_user: dict = Depends(get_current_user)):
    return {
        "valid": True,
        "payload": {
            "sub": current_user["sub"],
            "organization_id": current_user["organization_id"],
            "role": current_user["role"],
            "store_id": current_user.get("store_id"),
            "rop_stores": current_user.get("rop_stores", []),
        },
    }


# --- Super Admin routes ---

@router.post("/super/login")
async def super_login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    from app.config import settings as cfg
    result = await db.execute(select(SuperAdmin).where(SuperAdmin.email == body.email))
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    from datetime import timedelta
    from jose import jwt as jose_jwt
    token = jose_jwt.encode(
        {
            "sub": str(admin.id),
            "type": "super_access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        },
        cfg.JWT_SECRET,
        algorithm=cfg.JWT_ALGORITHM,
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/super/organizations", status_code=201)
async def create_organization(
    body: CreateOrganizationRequest,
    _: dict = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check slug uniqueness
    result = await db.execute(select(Organization).where(Organization.slug == body.org_slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Organization slug already exists")

    org = Organization(name=body.org_name, slug=body.org_slug)
    db.add(org)
    await db.flush()

    director = User(
        organization_id=org.id,
        email=body.director_email,
        password_hash=hash_password(body.director_password),
        role="director",
        first_name=body.director_first_name,
        last_name=body.director_last_name,
    )
    db.add(director)
    await db.commit()
    await db.refresh(org)

    return {"organization_id": str(org.id), "director_id": str(director.id)}
