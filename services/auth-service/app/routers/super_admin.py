"""Консоль технического администратора (суперадмина).

Вход — таблица auth.super_admins, токен type=super_access на 8 ч. Суперадмин видит все
организации: создаёт и настраивает их, управляет пользователями кабинета, магазинами,
продавцами, бейджами и лицензиями, может войти в кабинет под любым пользователем и
смотрит состояние сервисов.

Магазины, продавцы, бейджи и лицензии лежат в схеме admin_schema (admin-service).
admin-service умеет работать только внутри организации из токена, поэтому здесь они
читаются и пишутся напрямую через общий DATABASE_URL — как dashboard и analytics
читают чужие схемы.

Страница консоли отдаётся только по секретному пути SUPER_CONSOLE_PATH (env);
пусто — консоль выключена. Маршруты скрыты из Swagger.
"""
import hmac
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_super_admin
from app.models import Organization, RefreshToken, SuperAdmin, User
from app.routers.auth import CURRENCIES, INDUSTRIES, _build_token_response, _valid_timezone
from app.schemas import CreateOrganizationRequest, LoginRequest
from app.security import hash_password, verify_password

log = logging.getLogger("super_admin")

router = APIRouter(prefix="/api/v1/auth/super", tags=["super"], include_in_schema=False)
console_router = APIRouter(include_in_schema=False)

ROLES = ("director", "admin", "rop", "manager")
ORG_TYPES = ("retail", "telephony")
MIN_PASSWORD = 8
CONSOLE_HTML = Path(__file__).resolve().parent.parent / "static" / "super_console.html"


# --- Защита входа от перебора: не больше 5 неудачных попыток с одного IP за 15 минут ---

_FAIL_LIMIT = 5
_FAIL_WINDOW = 15 * 60
_failed_logins: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _recent_failures(ip: str) -> deque:
    q = _failed_logins[ip]
    border = time.monotonic() - _FAIL_WINDOW
    while q and q[0] < border:
        q.popleft()
    return q


# --- Страница консоли ---

@console_router.get("/api/v1/auth/console/{key}", response_class=HTMLResponse)
async def console_page(key: str):
    secret = settings.SUPER_CONSOLE_PATH.strip()
    if not secret or not hmac.compare_digest(key.encode(), secret.encode()):
        raise HTTPException(status_code=404, detail="Not Found")
    return HTMLResponse(
        CONSOLE_HTML.read_text(encoding="utf-8"),
        headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
                 "Referrer-Policy": "no-referrer"},
    )


# --- Вход ---

@router.post("/login")
async def super_login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    failures = _recent_failures(ip)
    if len(failures) >= _FAIL_LIMIT:
        raise HTTPException(status_code=429, detail="Too many attempts, try again in 15 minutes")

    admin = (await db.execute(
        select(SuperAdmin).where(SuperAdmin.email == body.email.strip().lower())
    )).scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        failures.append(time.monotonic())
        log.warning("Super admin login failed: email=%s ip=%s", body.email, ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    failures.clear()
    now = datetime.now(timezone.utc)
    token = jose_jwt.encode(
        {"sub": str(admin.id), "email": admin.email, "type": "super_access",
         "iat": now, "exp": now + timedelta(hours=8)},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    log.info("Super admin login: %s ip=%s", admin.email, ip)
    return {"access_token": token, "token_type": "bearer", "email": admin.email}


@router.get("/me")
async def super_me(sa: dict = Depends(get_super_admin)):
    return {"id": sa["sub"], "email": sa.get("email")}


# --- Общие проверки ---

def _check_org_fields(org_type, industry, currency, tz):
    if org_type is not None and org_type not in ORG_TYPES:
        raise HTTPException(status_code=422, detail="org_type must be 'retail' or 'telephony'")
    if industry not in (None, "") and industry not in INDUSTRIES:
        raise HTTPException(status_code=422, detail=f"industry must be one of: {', '.join(INDUSTRIES)}")
    if currency not in (None, "") and currency not in CURRENCIES:
        raise HTTPException(status_code=422, detail=f"currency must be one of: {', '.join(CURRENCIES)}")
    if tz not in (None, "") and not _valid_timezone(tz):
        raise HTTPException(status_code=422, detail="timezone must be an IANA name like Asia/Almaty")


def _check_password(password: str):
    if len(password) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD} characters")


async def _email_taken(db: AsyncSession, email: str, except_id=None) -> bool:
    # Вход ищет пользователя по email во всех организациях сразу, поэтому один email
    # в двух организациях ломает вход (500) — здесь email уникален на весь сервис
    q = select(User.id).where(func.lower(User.email) == email.lower())
    if except_id:
        q = q.where(User.id != except_id)
    return (await db.execute(q)).first() is not None


async def _org_or_404(db: AsyncSession, org_id) -> Organization:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _store_in_org(db: AsyncSession, store_id, org_id):
    row = (await db.execute(
        text("SELECT 1 FROM admin_schema.stores WHERE id = :s AND organization_id = :o"),
        {"s": str(store_id), "o": str(org_id)},
    )).first()
    if not row:
        raise HTTPException(status_code=422, detail="Store does not belong to this organization")


def _rows(result) -> list[dict]:
    return [dict(r._mapping) for r in result]


# --- Организации ---

class OrgCreate(CreateOrganizationRequest):
    org_type: str = "retail"
    industry: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    org_type: Optional[str] = None
    industry: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/organizations")
async def list_organizations(_: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT o.id, o.name, o.slug, o.org_type, o.industry, o.currency, o.timezone,
               o.is_active, o.created_at,
               (SELECT count(*) FROM auth.users u WHERE u.organization_id = o.id) AS users,
               (SELECT count(*) FROM admin_schema.stores s WHERE s.organization_id = o.id) AS stores,
               (SELECT count(*) FROM admin_schema.sellers s WHERE s.organization_id = o.id) AS sellers,
               (SELECT count(*) FROM admin_schema.devices d WHERE d.organization_id = o.id) AS devices,
               r.recordings, r.last_recording_at
        FROM auth.organizations o
        LEFT JOIN (SELECT organization_id, count(*) AS recordings, max(created_at) AS last_recording_at
                   FROM recorder.recordings GROUP BY organization_id) r ON r.organization_id = o.id
        ORDER BY o.created_at
    """))
    return {"items": _rows(result)}


@router.post("/organizations", status_code=201)
async def create_organization(body: OrgCreate, sa: dict = Depends(get_super_admin),
                              db: AsyncSession = Depends(get_db)):
    slug = body.org_slug.strip().lower()
    email = body.director_email.strip().lower()
    if not slug or not body.org_name.strip():
        raise HTTPException(status_code=422, detail="org_name and org_slug are required")
    _check_org_fields(body.org_type, body.industry, body.currency, body.timezone)
    _check_password(body.director_password)
    if (await db.execute(select(Organization.id).where(Organization.slug == slug))).first():
        raise HTTPException(status_code=409, detail="Organization slug already exists")
    if await _email_taken(db, email):
        raise HTTPException(status_code=409, detail="This email is already used by another user")

    org = Organization(name=body.org_name.strip(), slug=slug, org_type=body.org_type,
                       industry=body.industry or None, currency=body.currency or None,
                       timezone=body.timezone or None)
    db.add(org)
    await db.flush()
    director = User(organization_id=org.id, email=email,
                    password_hash=hash_password(body.director_password), role="director",
                    first_name=body.director_first_name, last_name=body.director_last_name)
    db.add(director)
    await db.commit()
    log.info("Super admin %s created organization %s (%s)", sa.get("email"), slug, org.id)
    return {"organization_id": str(org.id), "director_id": str(director.id)}


@router.patch("/organizations/{org_id}")
async def update_organization(org_id: UUID, body: OrgUpdate, sa: dict = Depends(get_super_admin),
                              db: AsyncSession = Depends(get_db)):
    org = await _org_or_404(db, org_id)
    fields = body.model_dump(exclude_unset=True)
    _check_org_fields(fields.get("org_type"), fields.get("industry"), fields.get("currency"),
                      fields.get("timezone"))
    if "name" in fields:
        if not (fields["name"] or "").strip():
            raise HTTPException(status_code=422, detail="name must not be empty")
        org.name = fields["name"].strip()
    if fields.get("org_type") is not None:
        org.org_type = fields["org_type"]
    for key in ("industry", "currency", "timezone"):
        if key in fields:
            setattr(org, key, fields[key] or None)
    if fields.get("is_active") is not None:
        org.is_active = fields["is_active"]
    await db.commit()
    log.info("Super admin %s updated organization %s: %s", sa.get("email"), org.slug, fields)
    return {"id": str(org.id), "name": org.name, "slug": org.slug, "org_type": org.org_type,
            "industry": org.industry, "currency": org.currency, "timezone": org.timezone,
            "is_active": org.is_active}


# --- Пользователи кабинета ---

class SuperUserCreate(BaseModel):
    organization_id: UUID
    email: str
    password: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    store_id: Optional[UUID] = None


class SuperUserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    store_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


async def _revoke_sessions(db: AsyncSession, user_id):
    await db.execute(update(RefreshToken)
                     .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
                     .values(revoked=True))


@router.get("/users")
async def list_users(organization_id: Optional[UUID] = Query(default=None),
                     _: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT u.id, u.organization_id, o.name AS organization_name, o.slug AS organization_slug,
               u.email, u.role, u.first_name, u.last_name, u.store_id, s.name AS store_name,
               u.is_active, u.created_at,
               (SELECT max(t.created_at) FROM auth.refresh_tokens t WHERE t.user_id = u.id) AS last_login_at
        FROM auth.users u
        JOIN auth.organizations o ON o.id = u.organization_id
        LEFT JOIN admin_schema.stores s ON s.id = u.store_id
        WHERE CAST(:org AS uuid) IS NULL OR u.organization_id = CAST(:org AS uuid)
        ORDER BY o.name, u.role, u.email
    """), {"org": str(organization_id) if organization_id else None})
    return {"items": _rows(result)}


@router.post("/users", status_code=201)
async def create_user(body: SuperUserCreate, sa: dict = Depends(get_super_admin),
                      db: AsyncSession = Depends(get_db)):
    await _org_or_404(db, body.organization_id)
    email = body.email.strip().lower()
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of: {', '.join(ROLES)}")
    if body.role == "manager" and not body.store_id:
        raise HTTPException(status_code=400, detail="store_id is required for manager role")
    if body.store_id:
        await _store_in_org(db, body.store_id, body.organization_id)
    _check_password(body.password)
    if await _email_taken(db, email):
        raise HTTPException(status_code=409, detail="This email is already used by another user")

    user = User(organization_id=body.organization_id, email=email,
                password_hash=hash_password(body.password), role=body.role,
                first_name=body.first_name, last_name=body.last_name,
                store_id=body.store_id if body.role == "manager" else None)
    db.add(user)
    await db.commit()
    log.info("Super admin %s created user %s (%s) in org %s", sa.get("email"), email, body.role,
             body.organization_id)
    return {"id": str(user.id)}


@router.patch("/users/{user_id}")
async def update_user(user_id: UUID, body: SuperUserUpdate, sa: dict = Depends(get_super_admin),
                      db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    fields = body.model_dump(exclude_unset=True)

    if fields.get("email") is not None:
        email = fields["email"].strip().lower()
        if not email:
            raise HTTPException(status_code=422, detail="email must not be empty")
        if await _email_taken(db, email, except_id=user.id):
            raise HTTPException(status_code=409, detail="This email is already used by another user")
        user.email = email
    role = fields.get("role") or user.role
    if role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of: {', '.join(ROLES)}")
    store_id = fields["store_id"] if "store_id" in fields else user.store_id
    if role == "manager" and not store_id:
        raise HTTPException(status_code=400, detail="store_id is required for manager role")
    if store_id and role == "manager":
        await _store_in_org(db, store_id, user.organization_id)
    role_changed = role != user.role
    user.role = role
    user.store_id = store_id if role == "manager" else None
    if "first_name" in fields:
        user.first_name = fields["first_name"]
    if "last_name" in fields:
        user.last_name = fields["last_name"]
    if fields.get("password"):
        _check_password(fields["password"])
        user.password_hash = hash_password(fields["password"])
        await _revoke_sessions(db, user.id)
    if fields.get("is_active") is not None:
        user.is_active = fields["is_active"]
        if not user.is_active:
            await _revoke_sessions(db, user.id)
    if role_changed:
        # Роль сидит в токене: старые сессии должны перевыпуститься
        await _revoke_sessions(db, user.id)
    await db.commit()
    safe = {k: v for k, v in fields.items() if k != "password"}
    if fields.get("password"):
        safe["password"] = "***"
    log.info("Super admin %s updated user %s: %s", sa.get("email"), user.email, safe)
    return {"id": str(user.id)}


@router.post("/users/{user_id}/impersonate")
async def impersonate(user_id: UUID, sa: dict = Depends(get_super_admin),
                      db: AsyncSession = Depends(get_db)):
    """Обычная пара токенов кабинета от имени пользователя: консоль кладёт её
    в хранилище SPA и открывает кабинет."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=409, detail="User is deactivated")
    log.warning("Super admin %s signs in as %s (%s, org %s)", sa.get("email"), user.email,
                user.role, user.organization_id)
    return await _build_token_response(db, user)


# --- Магазины, продавцы, бейджи, лицензии (admin_schema) ---

class StoreIn(BaseModel):
    organization_id: Optional[UUID] = None
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class SellerIn(BaseModel):
    store_id: Optional[UUID] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None


class DeviceIn(BaseModel):
    store_id: Optional[UUID] = None
    seller_id: Optional[UUID] = None
    serial_number: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


class LicenseIn(BaseModel):
    store_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


def _org_filter(organization_id: Optional[UUID]) -> dict:
    return {"org": str(organization_id) if organization_id else None}


async def _store_org(db: AsyncSession, store_id) -> str:
    row = (await db.execute(text("SELECT organization_id FROM admin_schema.stores WHERE id = :s"),
                            {"s": str(store_id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Store not found")
    return str(row.organization_id)


async def _patch_row(db: AsyncSession, table: str, row_id: UUID, values: dict):
    if not values:
        raise HTTPException(status_code=422, detail="Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in values)
    params = {k: (str(v) if isinstance(v, UUID) else v) for k, v in values.items()}
    params["id"] = str(row_id)
    try:
        result = await db.execute(
            text(f"UPDATE admin_schema.{table} SET {sets}, updated_at = now() WHERE id = :id"
                 if table != "store_licenses" else
                 f"UPDATE admin_schema.{table} SET {sets} WHERE id = :id"),
            params,
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Conflict with existing data")
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.commit()


@router.get("/stores")
async def list_stores(organization_id: Optional[UUID] = Query(default=None),
                      _: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT s.id, s.organization_id, o.name AS organization_name, s.name, s.address, s.is_active,
               s.created_at,
               (SELECT count(*) FROM admin_schema.sellers x WHERE x.store_id = s.id) AS sellers,
               (SELECT count(*) FROM admin_schema.devices d WHERE d.store_id = s.id) AS devices
        FROM admin_schema.stores s
        LEFT JOIN auth.organizations o ON o.id = s.organization_id
        WHERE CAST(:org AS uuid) IS NULL OR s.organization_id = CAST(:org AS uuid)
        ORDER BY o.name, s.name
    """), _org_filter(organization_id))
    return {"items": _rows(result)}


@router.post("/stores", status_code=201)
async def create_store(body: StoreIn, sa: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    if not body.organization_id or not (body.name or "").strip():
        raise HTTPException(status_code=422, detail="organization_id and name are required")
    await _org_or_404(db, body.organization_id)
    row = (await db.execute(text("""
        INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), :org, :name, :address, COALESCE(:active, true), now(), now())
        RETURNING id
    """), {"org": str(body.organization_id), "name": body.name.strip(), "address": body.address,
           "active": body.is_active})).first()
    await db.commit()
    log.info("Super admin %s created store %s in org %s", sa.get("email"), body.name, body.organization_id)
    return {"id": str(row.id)}


@router.patch("/stores/{store_id}")
async def update_store(store_id: UUID, body: StoreIn, _: dict = Depends(get_super_admin),
                       db: AsyncSession = Depends(get_db)):
    values = body.model_dump(exclude_unset=True, exclude={"organization_id"})
    if "name" in values and not (values["name"] or "").strip():
        raise HTTPException(status_code=422, detail="name must not be empty")
    await _patch_row(db, "stores", store_id, values)
    return {"id": str(store_id)}


@router.get("/sellers")
async def list_sellers(organization_id: Optional[UUID] = Query(default=None),
                       _: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT x.id, x.organization_id, o.name AS organization_name, x.store_id, s.name AS store_name,
               x.first_name, x.last_name, x.is_active, x.created_at,
               EXISTS (SELECT 1 FROM auth.mobile_accounts m
                       WHERE m.seller_id = x.id AND m.refresh_hash IS NOT NULL) AS has_mobile
        FROM admin_schema.sellers x
        LEFT JOIN admin_schema.stores s ON s.id = x.store_id
        LEFT JOIN auth.organizations o ON o.id = x.organization_id
        WHERE CAST(:org AS uuid) IS NULL OR x.organization_id = CAST(:org AS uuid)
        ORDER BY o.name, s.name, x.last_name, x.first_name
    """), _org_filter(organization_id))
    return {"items": _rows(result)}


@router.post("/sellers", status_code=201)
async def create_seller(body: SellerIn, sa: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    if not body.store_id or not (body.first_name or "").strip() or not (body.last_name or "").strip():
        raise HTTPException(status_code=422, detail="store_id, first_name and last_name are required")
    org_id = await _store_org(db, body.store_id)
    row = (await db.execute(text("""
        INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active,
                                          created_at, updated_at)
        VALUES (gen_random_uuid(), :org, :store, :fn, :ln, COALESCE(:active, true), now(), now())
        RETURNING id
    """), {"org": org_id, "store": str(body.store_id), "fn": body.first_name.strip(),
           "ln": body.last_name.strip(), "active": body.is_active})).first()
    await db.commit()
    log.info("Super admin %s created seller in store %s", sa.get("email"), body.store_id)
    return {"id": str(row.id)}


@router.patch("/sellers/{seller_id}")
async def update_seller(seller_id: UUID, body: SellerIn, _: dict = Depends(get_super_admin),
                        db: AsyncSession = Depends(get_db)):
    values = body.model_dump(exclude_unset=True)
    if "store_id" in values:
        if not values["store_id"]:
            raise HTTPException(status_code=422, detail="store_id must not be empty")
        cur = (await db.execute(text("SELECT organization_id FROM admin_schema.sellers WHERE id = :id"),
                                {"id": str(seller_id)})).first()
        if not cur:
            raise HTTPException(status_code=404, detail="Seller not found")
        if await _store_org(db, values["store_id"]) != str(cur.organization_id):
            raise HTTPException(status_code=422, detail="Store does not belong to the seller's organization")
    for k in ("first_name", "last_name"):
        if k in values and not (values[k] or "").strip():
            raise HTTPException(status_code=422, detail=f"{k} must not be empty")
    await _patch_row(db, "sellers", seller_id, values)
    return {"id": str(seller_id)}


@router.get("/devices")
async def list_devices(organization_id: Optional[UUID] = Query(default=None),
                       _: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT d.id, d.organization_id, o.name AS organization_name, d.store_id, s.name AS store_name,
               d.seller_id, trim(coalesce(x.first_name, '') || ' ' || coalesce(x.last_name, '')) AS seller_name,
               d.serial_number, d.model, d.is_active, d.last_seen_at
        FROM admin_schema.devices d
        LEFT JOIN admin_schema.stores s ON s.id = d.store_id
        LEFT JOIN admin_schema.sellers x ON x.id = d.seller_id
        LEFT JOIN auth.organizations o ON o.id = d.organization_id
        WHERE CAST(:org AS uuid) IS NULL OR d.organization_id = CAST(:org AS uuid)
        ORDER BY o.name, d.serial_number
    """), _org_filter(organization_id))
    return {"items": _rows(result)}


async def _check_device_seller(db: AsyncSession, seller_id, org_id: str):
    if not seller_id:
        return
    row = (await db.execute(text("SELECT organization_id FROM admin_schema.sellers WHERE id = :id"),
                            {"id": str(seller_id)})).first()
    if not row or str(row.organization_id) != org_id:
        raise HTTPException(status_code=422, detail="Seller does not belong to the store's organization")


@router.post("/devices", status_code=201)
async def create_device(body: DeviceIn, sa: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    if not body.store_id or not (body.serial_number or "").strip():
        raise HTTPException(status_code=422, detail="store_id and serial_number are required")
    org_id = await _store_org(db, body.store_id)
    await _check_device_seller(db, body.seller_id, org_id)
    try:
        row = (await db.execute(text("""
            INSERT INTO admin_schema.devices (id, organization_id, store_id, seller_id, serial_number, model,
                                              is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :org, :store, :seller, :serial, :model, COALESCE(:active, true), now(), now())
            RETURNING id
        """), {"org": org_id, "store": str(body.store_id),
               "seller": str(body.seller_id) if body.seller_id else None,
               "serial": body.serial_number.strip(), "model": body.model, "active": body.is_active})).first()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Device with this serial number already exists")
    await db.commit()
    log.info("Super admin %s created device %s", sa.get("email"), body.serial_number)
    return {"id": str(row.id)}


@router.patch("/devices/{device_id}")
async def update_device(device_id: UUID, body: DeviceIn, _: dict = Depends(get_super_admin),
                        db: AsyncSession = Depends(get_db)):
    values = body.model_dump(exclude_unset=True)
    cur = (await db.execute(text("SELECT organization_id, store_id FROM admin_schema.devices WHERE id = :id"),
                            {"id": str(device_id)})).first()
    if not cur:
        raise HTTPException(status_code=404, detail="Device not found")
    org_id = str(cur.organization_id)
    if "store_id" in values:
        if not values["store_id"]:
            raise HTTPException(status_code=422, detail="store_id must not be empty")
        if await _store_org(db, values["store_id"]) != org_id:
            raise HTTPException(status_code=422, detail="Store does not belong to the device's organization")
    if values.get("seller_id"):
        await _check_device_seller(db, values["seller_id"], org_id)
    if "serial_number" in values and not (values["serial_number"] or "").strip():
        raise HTTPException(status_code=422, detail="serial_number must not be empty")
    await _patch_row(db, "devices", device_id, values)
    return {"id": str(device_id)}


@router.get("/licenses")
async def list_licenses(organization_id: Optional[UUID] = Query(default=None),
                        _: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT l.id, l.organization_id, o.name AS organization_name, l.store_id, s.name AS store_name,
               l.is_active, l.starts_at, l.expires_at, l.notes, l.created_at
        FROM admin_schema.store_licenses l
        LEFT JOIN admin_schema.stores s ON s.id = l.store_id
        LEFT JOIN auth.organizations o ON o.id = l.organization_id
        WHERE CAST(:org AS uuid) IS NULL OR l.organization_id = CAST(:org AS uuid)
        ORDER BY o.name, s.name, l.starts_at DESC
    """), _org_filter(organization_id))
    return {"items": _rows(result)}


@router.post("/licenses", status_code=201)
async def create_license(body: LicenseIn, sa: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    if not body.store_id:
        raise HTTPException(status_code=422, detail="store_id is required")
    org_id = await _store_org(db, body.store_id)
    row = (await db.execute(text("""
        INSERT INTO admin_schema.store_licenses (id, organization_id, store_id, is_active, starts_at, expires_at,
                                                 granted_by, notes, created_at)
        VALUES (gen_random_uuid(), :org, :store, COALESCE(:active, true), COALESCE(:starts, now()), :expires,
                NULL, :notes, now())
        RETURNING id
    """), {"org": org_id, "store": str(body.store_id), "active": body.is_active, "starts": body.starts_at,
           "expires": body.expires_at, "notes": body.notes})).first()
    await db.commit()
    log.info("Super admin %s created license for store %s", sa.get("email"), body.store_id)
    return {"id": str(row.id)}


@router.patch("/licenses/{license_id}")
async def update_license(license_id: UUID, body: LicenseIn, _: dict = Depends(get_super_admin),
                         db: AsyncSession = Depends(get_db)):
    values = body.model_dump(exclude_unset=True, exclude={"store_id"})
    if "starts_at" in values and values["starts_at"] is None:
        values.pop("starts_at")                     # колонка NOT NULL: пустое поле — не менять
    if "is_active" in values and values["is_active"] is None:
        values.pop("is_active")
    await _patch_row(db, "store_licenses", license_id, values)
    return {"id": str(license_id)}


# --- Технические администраторы ---

class SuperAdminIn(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/admins")
async def list_admins(_: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    admins = (await db.execute(select(SuperAdmin).order_by(SuperAdmin.created_at))).scalars().all()
    return {"items": [{"id": str(a.id), "email": a.email, "is_active": a.is_active,
                       "created_at": a.created_at} for a in admins]}


@router.post("/admins", status_code=201)
async def create_admin(body: SuperAdminIn, sa: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    email = (body.email or "").strip().lower()
    if not email or not body.password:
        raise HTTPException(status_code=422, detail="email and password are required")
    _check_password(body.password)
    if (await db.execute(select(SuperAdmin.id).where(SuperAdmin.email == email))).first():
        raise HTTPException(status_code=409, detail="Admin with this email already exists")
    admin = SuperAdmin(email=email, password_hash=hash_password(body.password))
    db.add(admin)
    await db.commit()
    log.warning("Super admin %s created super admin %s", sa.get("email"), email)
    return {"id": str(admin.id)}


@router.patch("/admins/{admin_id}")
async def update_admin(admin_id: UUID, body: SuperAdminIn, sa: dict = Depends(get_super_admin),
                       db: AsyncSession = Depends(get_db)):
    admin = await db.get(SuperAdmin, admin_id)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if body.is_active is False:
        if str(admin.id) == sa["sub"]:
            raise HTTPException(status_code=409, detail="You cannot deactivate yourself")
        admin.is_active = False
    elif body.is_active:
        admin.is_active = True
    if body.password:
        _check_password(body.password)
        admin.password_hash = hash_password(body.password)
    await db.commit()
    log.warning("Super admin %s updated super admin %s (active=%s, password=%s)", sa.get("email"),
                admin.email, admin.is_active, bool(body.password))
    return {"id": str(admin.id)}


# --- Состояние сервиса ---

SERVICES = {
    "auth-service": "http://auth-service:8001/health",
    "admin-service": "http://admin-service:8007/health",
    "recorder-service": "http://recorder-service:8002/health",
    "transcription-service": "http://transcription-service:8003/health",
    "analytics-engine": "http://analytics-engine:8004/health",
    "scripts-service": "http://scripts-service:8005/health",
    "dashboard-service": "http://dashboard-service:8006/health",
}


async def _probe(client: httpx.AsyncClient, name: str, url: str) -> dict:
    started = time.monotonic()
    try:
        resp = await client.get(url)
        ok = resp.status_code == 200
        return {"name": name, "ok": ok, "status": resp.status_code,
                "ms": round((time.monotonic() - started) * 1000)}
    except Exception as exc:  # сервис лежит или не резолвится
        return {"name": name, "ok": False, "status": None, "error": type(exc).__name__,
                "ms": round((time.monotonic() - started) * 1000)}


@router.get("/system")
async def system_status(_: dict = Depends(get_super_admin), db: AsyncSession = Depends(get_db)):
    import asyncio
    async with httpx.AsyncClient(timeout=3.0) as client:
        services = await asyncio.gather(*(_probe(client, n, u) for n, u in SERVICES.items()))

    by_status = _rows(await db.execute(text("""
        SELECT status, count(*) AS count FROM recorder.recordings GROUP BY status ORDER BY count DESC
    """)))
    stuck = _rows(await db.execute(text("""
        SELECT r.id, o.name AS organization_name, r.source, r.status, r.created_at, r.updated_at
        FROM recorder.recordings r
        LEFT JOIN auth.organizations o ON o.id = r.organization_id
        WHERE r.status IN ('processing', 'mobile_queued', 'mobile_processing', 'segmented', 'transcribed')
          AND r.updated_at < now() - interval '1 hour'
        ORDER BY r.updated_at
        LIMIT 50
    """)))
    last_day = _rows(await db.execute(text("""
        SELECT o.name AS organization_name, r.status, count(*) AS count
        FROM recorder.recordings r
        LEFT JOIN auth.organizations o ON o.id = r.organization_id
        WHERE r.created_at > now() - interval '24 hours'
        GROUP BY o.name, r.status
        ORDER BY o.name, r.status
    """)))
    return {"checked_at": datetime.now(timezone.utc), "services": services,
            "recordings_by_status": by_status, "stuck_recordings": stuck, "last_24h": last_day}
