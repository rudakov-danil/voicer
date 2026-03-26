from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.database import engine
from app.models import Store, Seller, Device, PrivacySettings, AlertSettings, StoreLicense
from app.routers import stores, sellers, devices, settings as settings_router


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        if form.get("password") == settings.ADMIN_PANEL_PASSWORD:
            request.session.update({"admin": True})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("admin", False)


class StoreAdmin(ModelView, model=Store):
    name = "Магазин"
    name_plural = "Магазины"
    icon = "fa-solid fa-store"
    column_list = [Store.id, Store.name, Store.address, Store.is_active, Store.created_at]
    column_searchable_list = [Store.name]
    column_sortable_list = [Store.name, Store.is_active, Store.created_at]
    column_filters = [Store.is_active, Store.organization_id]
    can_create = True
    can_edit = True
    can_delete = True


class SellerAdmin(ModelView, model=Seller):
    name = "Продавец"
    name_plural = "Продавцы"
    icon = "fa-solid fa-user"
    column_list = [Seller.id, Seller.first_name, Seller.last_name, Seller.store_id, Seller.is_active, Seller.created_at]
    column_searchable_list = [Seller.first_name, Seller.last_name]
    column_sortable_list = [Seller.last_name, Seller.is_active, Seller.created_at]
    column_filters = [Seller.is_active, Seller.store_id]
    can_create = True
    can_edit = True
    can_delete = True


class DeviceAdmin(ModelView, model=Device):
    name = "Бейдж"
    name_plural = "Бейджи"
    icon = "fa-solid fa-microphone"
    column_list = [Device.id, Device.serial_number, Device.model, Device.store_id, Device.seller_id, Device.is_active, Device.last_seen_at]
    column_searchable_list = [Device.serial_number]
    column_sortable_list = [Device.serial_number, Device.is_active, Device.last_seen_at]
    column_filters = [Device.is_active, Device.store_id]
    can_create = True
    can_edit = True
    can_delete = True


class StoreLicenseAdmin(ModelView, model=StoreLicense):
    name = "Лицензия"
    name_plural = "Лицензии"
    icon = "fa-solid fa-certificate"
    column_list = [StoreLicense.id, StoreLicense.store_id, StoreLicense.is_active, StoreLicense.starts_at, StoreLicense.expires_at]
    column_filters = [StoreLicense.is_active]
    can_create = True
    can_edit = True
    can_delete = False


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

# sqladmin — панель управления данными
authentication_backend = AdminAuth(secret_key=settings.JWT_SECRET)
admin_panel = Admin(
    app,
    engine,
    title="VoiceIQ Admin",
    base_url="/admin",
    authentication_backend=authentication_backend,
)
admin_panel.add_view(StoreAdmin)
admin_panel.add_view(SellerAdmin)
admin_panel.add_view(DeviceAdmin)
admin_panel.add_view(StoreLicenseAdmin)

app.include_router(stores.router)
app.include_router(sellers.router)
app.include_router(devices.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "admin-service"}
