from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Organization, RefreshToken, RopStoreAssignment, User
from app.schemas import (
    ChangePasswordRequest,
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


def _request_host(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return host.split(",")[0].split(":")[0].strip().lower()


async def _showcase_org(db: AsyncSession, user: User, host: str):
    """Организация витрины для этого домена (DOMAIN_ORGS), если пользователь может в неё войти:
    директор или админ организации из DOMAIN_ORG_GUESTS. Иначе None — обычный вход."""
    domains = dict(pair.strip().split("=", 1) for pair in settings.DOMAIN_ORGS.split(",") if "=" in pair)
    if "horeca.voicer-ai.pro" in domains:
        domains.setdefault("mobile.voicer-ai.pro", domains["horeca.voicer-ai.pro"])
    slug = domains.get(host)
    if not slug or user.role not in ("director", "admin"):
        return None
    guests = {s.strip() for s in settings.DOMAIN_ORG_GUESTS.split(",") if s.strip()}
    home = await db.get(Organization, user.organization_id)
    if not home or home.slug not in guests:
        return None
    target = (await db.execute(
        select(Organization).where(Organization.slug == slug.strip(), Organization.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    return target if target and target.id != user.organization_id else None


async def _build_token_response(db: AsyncSession, user: User, host: str = "") -> dict:
    # Организацию отключает суперадмин: её пользователи больше не входят и не обновляют токены
    home = await db.get(Organization, user.organization_id)
    if not home or not home.is_active:
        raise HTTPException(status_code=403, detail="Organization is deactivated")

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
    showcase = await _showcase_org(db, user, host)
    if showcase:
        # Учётка остаётся в своей организации (home_org — по ней проверяется токен),
        # а работает с данными витрины
        access_payload.update(organization_id=str(showcase.id), home_org=str(user.organization_id), store_id=None)
    access_token = create_access_token(access_payload)
    refresh_token_str, jti = create_refresh_token(str(user.id))

    token_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_password(refresh_token_str),
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(token_record)
    await db.commit()

    user_out = UserResponse.model_validate(user)
    if showcase:
        user_out = user_out.model_copy(update={"organization_id": showcase.id, "store_id": None})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "expires_in": 900,
        "user": user_out,
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    return await _build_token_response(db, user, _request_host(request))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
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

    return await _build_token_response(db, user, _request_host(request))


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


# --- Organization info / type ---

@router.get("/organization")
async def get_organization(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(Organization.id == current_user["organization_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "org_type": org.org_type,
        "industry": org.industry,
        "currency": org.currency,
        "timezone": org.timezone,
    }


# Отрасль подстраивает промпты анализа и стартовый пакет скриптов (scripts-service, /verticals)
INDUSTRIES = ("coffee", "pharmacy", "clinic", "electronics", "clothing", "cosmetics", "furniture", "telecom", "generic")
CURRENCIES = ("RUB", "KZT", "UZS", "KGS", "BYN", "USD", "EUR")


def _valid_timezone(name: str) -> bool:
    from zoneinfo import ZoneInfo
    try:
        ZoneInfo(name)
        return True
    except Exception:
        return False


@router.patch("/organization")
async def update_organization(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can change organization settings")
    org_type = body.get("org_type")
    if org_type is not None and org_type not in ("retail", "telephony"):
        raise HTTPException(status_code=422, detail="org_type must be 'retail' or 'telephony'")
    industry = body.get("industry")
    if industry is not None and industry not in INDUSTRIES:
        raise HTTPException(status_code=422, detail=f"industry must be one of: {', '.join(INDUSTRIES)}")
    currency = body.get("currency")
    if currency is not None and currency not in CURRENCIES:
        raise HTTPException(status_code=422, detail=f"currency must be one of: {', '.join(CURRENCIES)}")
    tz = body.get("timezone")
    if tz is not None and not _valid_timezone(tz):
        raise HTTPException(status_code=422, detail="timezone must be an IANA name like Asia/Almaty")
    if org_type is None and not any(k in body for k in ("industry", "currency", "timezone")):
        raise HTTPException(status_code=422, detail="Nothing to update: pass org_type, industry, currency or timezone")

    result = await db.execute(
        select(Organization).where(Organization.id == current_user["organization_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org_type is not None:
        org.org_type = org_type
    if "industry" in body:
        org.industry = industry
    if "currency" in body:
        org.currency = currency
    if "timezone" in body:
        org.timezone = tz
    await db.commit()
    return {"id": str(org.id), "org_type": org.org_type, "industry": org.industry,
            "currency": org.currency, "timezone": org.timezone}
