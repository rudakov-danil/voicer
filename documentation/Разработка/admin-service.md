# Admin Service (Сервис администрирования)

## Описание сервиса

Admin Service отвечает за управление инфраструктурой системы: магазины, продавцы, аудиобейджи (устройства), настройки приватности и алерты. Используется администраторами и менеджерами для управления данными организации. Реализует контроль доступа на основе ролей пользователя (director, admin, rop, manager).

## Принципы работы

### Архитектура

1. **REST API**: FastAPI с JWT аутентификацией через Auth Service
2. **Контроль доступа**: Role-Based Access Control на базе данных JWT токена
   - director, admin видят все магазины своей организации
   - rop видят только назначенные им магазины
   - manager видит только свой магазин
3. **Изоляция данных**: По organization_id и store_id
4. **Асинхронная БД**: SQLAlchemy с AsyncSession

### Основная логика

- Управление сущностями: Store (магазины), Seller (продавцы), Device (бейджи)
- Динамический контроль доступа в каждом endpoint в зависимости от role пользователя
- Настройки приватности (retention_days, anonymize_transcripts) и алертов (score_threshold, email_recipients)

## Входные и выходные данные

### REST API Endpoints

**Stores** (`/api/v1/admin/stores`):
- `GET /` — список магазинов пользователя (с фильтрацией по is_active)
- `POST /` — создание магазина (только director/admin)
- `GET /{store_id}` — получение магазина с подсчётом продавцов и устройств
- `PATCH /{store_id}` — обновление магазина (только director/admin)

**Sellers** (`/api/v1/admin/sellers`):
- `GET /` — список продавцов (с фильтрацией по store_id, is_active)
- `POST /` — создание продавца (director/admin/manager, manager только в своём магазине)
- `GET /{seller_id}` — получение продавца
- `PATCH /{seller_id}` — обновление продавца

**Devices** (`/api/v1/admin/devices`):
- `GET /` — список устройств (бейджей) с фильтрацией
- `POST /` — создание устройства (только director/admin)
- `PATCH /{device_id}` — обновление устройства
- `GET /by-serial/{serial_number}` — получение устройства по серийному номеру (без JWT, для recorder-service)

**Settings** (`/api/v1/admin/settings`):
- `GET /privacy` — получение настроек приватности
- `PUT /privacy` — обновление настроек приватности
- `GET /alerts` — получение настроек алертов
- `PUT /alerts` — обновление настроек алертов

### База данных (PostgreSQL schema: admin_schema)

**Таблица `stores`**:
- id (UUID primary key)
- organization_id (UUID)
- name (string)
- address (optional string)
- is_active (boolean)
- created_at, updated_at (datetime)

**Таблица `sellers`**:
- id (UUID primary key)
- organization_id (UUID)
- store_id (UUID FK)
- first_name (string)
- last_name (string)
- is_active (boolean)
- created_at, updated_at (datetime)

**Таблица `devices`**:
- id (UUID primary key)
- organization_id (UUID)
- store_id (UUID FK)
- seller_id (UUID FK optional)
- serial_number (string unique)
- model (optional string)
- is_active (boolean)
- last_seen_at (optional datetime)
- created_at, updated_at (datetime)

**Таблица `privacy_settings`**:
- id (UUID primary key)
- organization_id (UUID)
- store_id (UUID FK optional)
- retention_days (integer, default 90)
- anonymize_transcripts (boolean, default false)
- consent_required (boolean, default true)
- updated_at (datetime)

**Таблица `alert_settings`**:
- id (UUID primary key)
- organization_id (UUID)
- store_id (UUID FK optional)
- score_threshold (integer, default 60)
- no_activity_hours (optional integer, default 4)
- email_recipients (ARRAY[text] optional)
- is_active (boolean)
- updated_at (datetime)

**Таблица `store_licenses`**:
- id (UUID primary key)
- organization_id (UUID)
- store_id (UUID FK)
- is_active (boolean)
- starts_at (datetime)
- expires_at (optional datetime)
- granted_by (optional UUID)
- notes (optional text)
- created_at (datetime)

## Код сервиса

### app/config.py

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
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
import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify",
            headers={"Authorization": f"Bearer {credentials.credentials}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return resp.json()["payload"]


def require_role(*roles: str):
    async def _check(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check
```

### app/main.py

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import stores, sellers, devices, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="VoiceIQ Admin Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(stores.router)
app.include_router(sellers.router)
app.include_router(devices.router)
app.include_router(settings.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "admin-service"}
```

### app/models.py

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    sellers = relationship("Seller", back_populates="store")
    devices = relationship("Device", back_populates="store")


class Seller(Base):
    __tablename__ = "sellers"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    store = relationship("Store", back_populates="sellers")


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.sellers.id", ondelete="SET NULL"), nullable=True)
    serial_number = Column(String(100), nullable=False, unique=True)
    model = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    store = relationship("Store", back_populates="devices")
    seller = relationship("Seller")


class PrivacySettings(Base):
    __tablename__ = "privacy_settings"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True)
    retention_days = Column(Integer, nullable=False, default=90)
    anonymize_transcripts = Column(Boolean, nullable=False, default=False)
    consent_required = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class AlertSettings(Base):
    __tablename__ = "alert_settings"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="CASCADE"), nullable=True)
    score_threshold = Column(Integer, nullable=False, default=60)
    no_activity_hours = Column(Integer, nullable=True, default=4)
    email_recipients = Column(ARRAY(Text), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class StoreLicense(Base):
    __tablename__ = "store_licenses"
    __table_args__ = {"schema": "admin_schema"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    store_id = Column(UUID(as_uuid=True), ForeignKey("admin_schema.stores.id", ondelete="RESTRICT"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    starts_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    granted_by = Column(UUID(as_uuid=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
```

### app/schemas.py

```python
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# --- Stores ---

class StoreResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    address: Optional[str]
    is_active: bool
    seller_count: int = 0
    device_count: int = 0

    class Config:
        from_attributes = True


class StoreCreateRequest(BaseModel):
    name: str
    address: Optional[str] = None


class StoreUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class StoreListResponse(BaseModel):
    items: list[StoreResponse]
    total: int


# --- Sellers ---

class SellerResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    store_name: Optional[str] = None
    first_name: str
    last_name: str
    is_active: bool

    class Config:
        from_attributes = True


class SellerCreateRequest(BaseModel):
    store_id: UUID
    first_name: str
    last_name: str


class SellerUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None


class SellerListResponse(BaseModel):
    items: list[SellerResponse]
    total: int


# --- Devices ---

class SellerShort(BaseModel):
    id: UUID
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class DeviceResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    seller_id: Optional[UUID]
    serial_number: str
    model: Optional[str]
    is_active: bool
    last_seen_at: Optional[datetime]

    class Config:
        from_attributes = True


class DeviceWithSellerResponse(DeviceResponse):
    seller: Optional[SellerShort] = None


class DeviceCreateRequest(BaseModel):
    store_id: UUID
    seller_id: Optional[UUID] = None
    serial_number: str
    model: Optional[str] = None


class DeviceUpdateRequest(BaseModel):
    seller_id: Optional[UUID] = None
    store_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class DeviceListResponse(BaseModel):
    items: list[DeviceResponse]
    total: int


# --- Settings ---

class PrivacySettingsResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: Optional[UUID]
    retention_days: int
    anonymize_transcripts: bool
    consent_required: bool

    class Config:
        from_attributes = True


class PrivacySettingsUpdateRequest(BaseModel):
    store_id: Optional[UUID] = None
    retention_days: int = 90
    anonymize_transcripts: bool = False
    consent_required: bool = True


class AlertSettingsResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: Optional[UUID]
    score_threshold: int
    no_activity_hours: Optional[int]
    email_recipients: Optional[list[str]]
    is_active: bool

    class Config:
        from_attributes = True


class AlertSettingsUpdateRequest(BaseModel):
    store_id: Optional[UUID] = None
    score_threshold: int = 60
    no_activity_hours: Optional[int] = 4
    email_recipients: Optional[list[str]] = None
    is_active: bool = True
```

### app/routers/stores.py

```python
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
```

### app/routers/sellers.py

```python
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
    seller = (await db.execute(
        select(Seller).where(Seller.id == seller_id, Seller.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
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
```

### app/routers/devices.py

```python
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Device, Seller, Store
from app.schemas import (
    DeviceCreateRequest, DeviceListResponse, DeviceResponse,
    DeviceUpdateRequest, DeviceWithSellerResponse, SellerShort,
)

router = APIRouter(prefix="/api/v1/admin/devices", tags=["devices"])


def _apply_device_access(q, user: dict):
    role = user["role"]
    q = q.where(Device.organization_id == user["organization_id"])
    if role == "rop":
        q = q.where(Device.store_id.in_(user.get("rop_stores", [])))
    elif role == "manager":
        q = q.where(Device.store_id == user["store_id"])
    return q


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    store_id: UUID | None = Query(default=None),
    seller_id: UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Device)
    q = _apply_device_access(q, current_user)
    if store_id:
        q = q.where(Device.store_id == store_id)
    if seller_id:
        q = q.where(Device.seller_id == seller_id)
    if is_active is not None:
        q = q.where(Device.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    devices = (await db.execute(q.limit(limit).offset(offset))).scalars().all()

    return {"items": [DeviceResponse.model_validate(d) for d in devices], "total": total}


@router.post("", response_model=DeviceResponse, status_code=201)
async def create_device(
    body: DeviceCreateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(Device).where(Device.serial_number == body.serial_number)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Device with this serial number already exists")

    store = (await db.execute(
        select(Store).where(Store.id == body.store_id, Store.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    device = Device(
        organization_id=current_user["organization_id"],
        store_id=body.store_id,
        seller_id=body.seller_id,
        serial_number=body.serial_number,
        model=body.model,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return DeviceResponse.model_validate(device)


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: UUID,
    body: DeviceUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    device = (await db.execute(
        select(Device).where(Device.id == device_id, Device.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if body.seller_id is not None:
        device.seller_id = body.seller_id
    if body.store_id is not None:
        device.store_id = body.store_id
    if body.is_active is not None:
        device.is_active = body.is_active

    await db.commit()
    await db.refresh(device)
    return DeviceResponse.model_validate(device)


@router.get("/by-serial/{serial_number}", response_model=DeviceWithSellerResponse)
async def get_device_by_serial(
    serial_number: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Используется recorder-service для идентификации бейджа.
    Не требует JWT — аутентификация на стороне recorder-service по device_id.
    """
    device = (await db.execute(
        select(Device).where(Device.serial_number == serial_number)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="Device is inactive")

    seller = None
    if device.seller_id:
        seller_obj = (await db.execute(
            select(Seller).where(Seller.id == device.seller_id)
        )).scalar_one_or_none()
        if seller_obj:
            seller = SellerShort(id=seller_obj.id, first_name=seller_obj.first_name, last_name=seller_obj.last_name)

    return DeviceWithSellerResponse(
        id=device.id,
        organization_id=device.organization_id,
        store_id=device.store_id,
        seller_id=device.seller_id,
        serial_number=device.serial_number,
        model=device.model,
        is_active=device.is_active,
        last_seen_at=device.last_seen_at,
        seller=seller,
    )
```

### app/routers/settings.py

```python
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models import AlertSettings, PrivacySettings
from app.schemas import (
    AlertSettingsResponse, AlertSettingsUpdateRequest,
    PrivacySettingsResponse, PrivacySettingsUpdateRequest,
)

router = APIRouter(prefix="/api/v1/admin/settings", tags=["settings"])


@router.get("/privacy", response_model=PrivacySettingsResponse)
async def get_privacy_settings(
    store_id: Optional[UUID] = Query(default=None),
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    q = select(PrivacySettings).where(
        PrivacySettings.organization_id == current_user["organization_id"],
        PrivacySettings.store_id == store_id,
    )
    settings_obj = (await db.execute(q)).scalar_one_or_none()

    if not settings_obj:
        # Return defaults
        return PrivacySettingsResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            organization_id=UUID(current_user["organization_id"]),
            store_id=store_id,
            retention_days=90,
            anonymize_transcripts=False,
            consent_required=True,
        )
    return PrivacySettingsResponse.model_validate(settings_obj)


@router.put("/privacy", response_model=PrivacySettingsResponse)
async def update_privacy_settings(
    body: PrivacySettingsUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(PrivacySettings).where(
            PrivacySettings.organization_id == current_user["organization_id"],
            PrivacySettings.store_id == body.store_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.retention_days = body.retention_days
        existing.anonymize_transcripts = body.anonymize_transcripts
        existing.consent_required = body.consent_required
        await db.commit()
        await db.refresh(existing)
        return PrivacySettingsResponse.model_validate(existing)
    else:
        new_settings = PrivacySettings(
            organization_id=current_user["organization_id"],
            store_id=body.store_id,
            retention_days=body.retention_days,
            anonymize_transcripts=body.anonymize_transcripts,
            consent_required=body.consent_required,
        )
        db.add(new_settings)
        await db.commit()
        await db.refresh(new_settings)
        return PrivacySettingsResponse.model_validate(new_settings)


@router.get("/alerts", response_model=AlertSettingsResponse)
async def get_alert_settings(
    store_id: Optional[UUID] = Query(default=None),
    current_user: dict = Depends(require_role("director", "admin", "rop")),
    db: AsyncSession = Depends(get_db),
):
    alert = (await db.execute(
        select(AlertSettings).where(
            AlertSettings.organization_id == current_user["organization_id"],
            AlertSettings.store_id == store_id,
        )
    )).scalar_one_or_none()

    if not alert:
        return AlertSettingsResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            organization_id=UUID(current_user["organization_id"]),
            store_id=store_id,
            score_threshold=60,
            no_activity_hours=4,
            email_recipients=[],
            is_active=True,
        )
    return AlertSettingsResponse.model_validate(alert)


@router.put("/alerts", response_model=AlertSettingsResponse)
async def update_alert_settings(
    body: AlertSettingsUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(AlertSettings).where(
            AlertSettings.organization_id == current_user["organization_id"],
            AlertSettings.store_id == body.store_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.score_threshold = body.score_threshold
        existing.no_activity_hours = body.no_activity_hours
        existing.email_recipients = body.email_recipients
        existing.is_active = body.is_active
        await db.commit()
        await db.refresh(existing)
        return AlertSettingsResponse.model_validate(existing)
    else:
        new_alert = AlertSettings(
            organization_id=current_user["organization_id"],
            store_id=body.store_id,
            score_threshold=body.score_threshold,
            no_activity_hours=body.no_activity_hours,
            email_recipients=body.email_recipients,
            is_active=body.is_active,
        )
        db.add(new_alert)
        await db.commit()
        await db.refresh(new_alert)
        return AlertSettingsResponse.model_validate(new_alert)
```
