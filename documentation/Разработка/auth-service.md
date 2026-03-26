# Auth Service (Сервис аутентификации)

## Описание сервиса

Auth Service отвечает за управление аутентификацией и авторизацией в системе VoiceIQ. Сервис обрабатывает вход пользователей, выпуск JWT-токенов, управление сессиями через refresh-токены и проверку прав доступа на основе ролей (RBAC). Поддерживает несколько ролей: director (директор), admin, rop (региональный операционный менеджер) и manager (менеджер магазина).

## Принципы работы

### Архитектура

1. **Аутентификация**: Проверка email/password с использованием bcrypt (12 раундов)
2. **Токены**:
   - Access token (JWT) — действует 15 минут, используется для API запросов
   - Refresh token (JWT) — действует 30 дней, хранится в БД в виде bcrypt-хеша
3. **Авторизация**: Role-Based Access Control (RBAC) с использованием JWT payload
4. **Изоляция данных**: Каждый пользователь привязан к organization_id

### Основная логика

- Пользователь входит через `/login` с email и password
- Сервис создаёт access и refresh токены, сохраняет refresh в БД
- При expiration access token клиент использует refresh для получения нового access token
- Logout отзывает все существующие refresh токены пользователя
- Super Admin может создавать новые организации и первого пользователя (director)

## Входные и выходные данные

### REST API Endpoints

**Auth endpoints** (`/api/v1/auth`):
- `POST /login` — вход пользователя (email, password) → TokenResponse
- `POST /refresh` — получение нового access token (refresh_token) → TokenResponse
- `POST /logout` — выход пользователя → {message}
- `GET /verify` — проверка валидности access token → VerifyResponse
- `POST /super/login` — вход Super Admin
- `POST /super/organizations` — создание новой организации (только Super Admin)

**User management endpoints** (`/api/v1/auth/users`):
- `GET /` — список пользователей организации с фильтрацией
- `POST /` — создание пользователя (требует role director или admin)
- `PATCH /{user_id}` — обновление данных пользователя
- `POST /{user_id}/change-password` — смена пароля
- `POST /{user_id}/rop-stores` — назначение магазинов ROP-менеджеру

### База данных (PostgreSQL schema: auth)

**Таблица `organizations`**:
- id (UUID primary key)
- name (string)
- slug (string unique)
- is_active (boolean)
- created_at, updated_at (datetime)

**Таблица `users`**:
- id (UUID primary key)
- organization_id (UUID FK)
- email (string)
- password_hash (string)
- role (string: director, admin, rop, manager)
- first_name, last_name (optional string)
- store_id (UUID optional, для manager role)
- is_active (boolean)
- created_at, updated_at (datetime)

**Таблица `refresh_tokens`**:
- id (UUID primary key)
- user_id (UUID FK)
- token_hash (string unique)
- expires_at (datetime)
- revoked (boolean)
- created_at (datetime)
- ip_address (optional inet)
- user_agent (optional string)

**Таблица `rop_store_assignments`**:
- id (UUID primary key)
- rop_user_id (UUID FK)
- store_id (UUID)
- organization_id (UUID FK)
- assigned_at (datetime)

**Таблица `super_admins`**:
- id (UUID primary key)
- email (string unique)
- password_hash (string)
- is_active (boolean)
- created_at (datetime)

## Код сервиса

### app/config.py

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
```

### app/database.py

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_maker() as session:
        yield session
```

### app/dependencies.py

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.security import decode_token

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Not an access token")

    result = await db.execute(
        text("SELECT is_active FROM auth.users WHERE id = :id AND organization_id = :org"),
        {"id": payload["sub"], "org": payload["organization_id"]},
    )
    row = result.fetchone()
    if not row or not row.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return payload


def require_role(*roles: str):
    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check


async def get_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("type") != "super_access":
        raise HTTPException(status_code=403, detail="Super admin access required")

    result = await db.execute(
        text("SELECT is_active FROM auth.super_admins WHERE id = :id"),
        {"id": payload["sub"]},
    )
    row = result.fetchone()
    if not row or not row.is_active:
        raise HTTPException(status_code=401, detail="Super admin not found or deactivated")

    return payload
```

### app/main.py

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import auth, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="VoiceIQ Auth Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(auth.router)
app.include_router(users.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth-service"}


@app.get("/api/v1/auth/health")
async def api_health():
    return {"status": "ok"}
```

### app/models.py

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID, INET
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    users = relationship("User", back_populates="organization")


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("auth.organizations.id", ondelete="RESTRICT"), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # director | admin | rop | manager
    first_name = Column(String(100))
    last_name = Column(String(100))
    store_id = Column(UUID(as_uuid=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    organization = relationship("Organization", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    rop_assignments = relationship("RopStoreAssignment", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    ip_address = Column(INET, nullable=True)
    user_agent = Column(String(500), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class RopStoreAssignment(Base):
    __tablename__ = "rop_store_assignments"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rop_user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    store_id = Column(UUID(as_uuid=True), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("auth.organizations.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    user = relationship("User", back_populates="rop_assignments")


class SuperAdmin(Base):
    __tablename__ = "super_admins"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
```

### app/schemas.py

```python
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


# --- Auth ---

class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserResponse"


class VerifyResponse(BaseModel):
    valid: bool
    payload: dict


# --- Users ---

class UserResponse(BaseModel):
    id: UUID
    email: str
    role: str
    first_name: Optional[str]
    last_name: Optional[str]
    organization_id: UUID
    store_id: Optional[UUID]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreateRequest(BaseModel):
    email: str
    password: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    store_id: Optional[UUID] = None


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    store_id: Optional[UUID] = None


class ChangePasswordRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: str


class RopStoresRequest(BaseModel):
    store_ids: list[UUID]


# --- Super Admin ---

class CreateOrganizationRequest(BaseModel):
    org_name: str
    org_slug: str
    director_email: str
    director_password: str
    director_first_name: str
    director_last_name: str


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


TokenResponse.model_rebuild()
```

### app/security.py

```python
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(payload: dict) -> str:
    data = payload.copy()
    data.update({
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    })
    return jwt.encode(data, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, str]:
    """Returns (encoded_token, jti)"""
    jti = str(uuid4())
    data = {
        "sub": user_id,
        "jti": jti,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(data, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM), jti


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid token."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
```

### app/routers/auth.py

```python
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
```

### app/routers/users.py

```python
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
```
