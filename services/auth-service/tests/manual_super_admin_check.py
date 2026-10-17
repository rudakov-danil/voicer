"""Проверка консоли суперадмина на настоящей БД без следов.

Все запросы идут в приложение в памяти (ASGITransport), а сессия БД живёт внутри
внешней транзакции, которая в конце откатывается: commit() в ручках становится
savepoint'ом. Временный суперадмин, организация, пользователь, магазин, продавец,
бейдж и лицензия исчезают вместе с откатом.

Запуск (не pytest, имя без test_):
    docker compose run --rm --no-deps -T auth-service python tests/manual_super_admin_check.py </dev/null
"""
import asyncio
import sys
import uuid

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import engine, get_db
from app.main import app
from app.models import SuperAdmin
from app.security import hash_password

failures = []


def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        failures.append(what)


async def main() -> int:
    tag = uuid.uuid4().hex[:8]
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint")

        async def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        try:
            email, password = f"check-{tag}@example.invalid", "Pass-" + uuid.uuid4().hex
            session.add(SuperAdmin(email=email, password_hash=hash_password(password)))
            await session.commit()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://check") as c:
                r = await c.get("/api/v1/auth/console/wrong-key")
                check(r.status_code == 404, "консоль по неверному ключу — 404")
                if settings.SUPER_CONSOLE_PATH:
                    r = await c.get(f"/api/v1/auth/console/{settings.SUPER_CONSOLE_PATH}")
                    check(r.status_code == 200 and "техническая консоль" in r.text, "консоль по верному ключу")
                r = await c.get("/openapi.json")
                check("/api/v1/auth/super/login" not in r.text, "ручки super скрыты из Swagger")

                r = await c.get("/api/v1/auth/super/organizations")
                check(r.status_code in (401, 403), "без токена — отказ")
                r = await c.post("/api/v1/auth/super/login", json={"email": email, "password": "wrong"})
                check(r.status_code == 401, "неверный пароль — 401")
                r = await c.post("/api/v1/auth/super/login", json={"email": email.upper(), "password": password})
                check(r.status_code == 200, "вход суперадмина")
                h = {"Authorization": "Bearer " + r.json()["access_token"]}

                r = await c.get("/api/v1/auth/super/me", headers=h)
                check(r.status_code == 200 and r.json()["email"] == email, "/me")
                for path in ("organizations", "users", "stores", "sellers", "devices", "licenses", "admins"):
                    r = await c.get(f"/api/v1/auth/super/{path}", headers=h)
                    check(r.status_code == 200 and "items" in r.json(), f"список {path} ({len(r.json().get('items', []))})")
                r = await c.get("/api/v1/auth/super/system", headers=h)
                body = r.json()
                check(r.status_code == 200, "состояние сервиса")
                for s in body.get("services", []):
                    print(f"     {s['name']}: {'ok' if s['ok'] else 'НЕТ'} {s.get('status')} {s['ms']} мс")
                print(f"     зависших записей: {len(body.get('stuck_recordings', []))}")

                slug = f"check-{tag}"
                r = await c.post("/api/v1/auth/super/organizations", headers=h, json={
                    "org_name": "Проверка " + tag, "org_slug": slug, "org_type": "retail", "industry": "coffee",
                    "currency": "KZT", "timezone": "Asia/Almaty", "director_email": f"dir-{tag}@example.invalid",
                    "director_password": "Director-" + tag, "director_first_name": "Тест", "director_last_name": "Тестов"})
                check(r.status_code == 201, "создание организации")
                org_id, director_id = r.json()["organization_id"], r.json()["director_id"]
                r = await c.post("/api/v1/auth/super/organizations", headers=h, json={
                    "org_name": "x", "org_slug": slug, "director_email": f"x-{tag}@example.invalid",
                    "director_password": "12345678", "director_first_name": "x", "director_last_name": "x"})
                check(r.status_code == 409, "повтор slug — 409")
                r = await c.patch(f"/api/v1/auth/super/organizations/{org_id}", headers=h,
                                  json={"timezone": "Mars/Base"})
                check(r.status_code == 422, "неверный часовой пояс — 422")

                r = await c.post("/api/v1/auth/super/stores", headers=h,
                                 json={"organization_id": org_id, "name": "Точка " + tag, "address": "ул. Тест"})
                check(r.status_code == 201, "создание магазина")
                store_id = r.json()["id"]
                r = await c.patch(f"/api/v1/auth/super/stores/{store_id}", headers=h, json={"address": "ул. Новая"})
                check(r.status_code == 200, "правка магазина")
                r = await c.post("/api/v1/auth/super/sellers", headers=h,
                                 json={"store_id": store_id, "first_name": "Бариста", "last_name": tag})
                check(r.status_code == 201, "создание продавца")
                seller_id = r.json()["id"]
                r = await c.post("/api/v1/auth/super/devices", headers=h,
                                 json={"store_id": store_id, "seller_id": seller_id, "serial_number": "CHK-" + tag})
                check(r.status_code == 201, "создание бейджа")
                r = await c.post("/api/v1/auth/super/devices", headers=h,
                                 json={"store_id": store_id, "serial_number": "CHK-" + tag})
                check(r.status_code == 409, "повтор серийного номера — 409")
                r = await c.post("/api/v1/auth/super/licenses", headers=h, json={"store_id": store_id, "notes": "тест"})
                check(r.status_code == 201, "создание лицензии")
                r = await c.patch(f"/api/v1/auth/super/licenses/{r.json()['id']}", headers=h,
                                  json={"starts_at": None, "expires_at": "2030-01-01T00:00:00Z"})
                check(r.status_code == 200, "правка лицензии")

                r = await c.post("/api/v1/auth/super/users", headers=h, json={
                    "organization_id": org_id, "email": f"mgr-{tag}@example.invalid", "password": "Manager-" + tag,
                    "role": "manager"})
                check(r.status_code == 400, "менеджер без магазина — 400")
                r = await c.post("/api/v1/auth/super/users", headers=h, json={
                    "organization_id": org_id, "email": f"MGR-{tag}@example.invalid", "password": "Manager-" + tag,
                    "role": "manager", "store_id": store_id})
                check(r.status_code == 201, "создание менеджера")
                mgr_id = r.json()["id"]
                r = await c.post("/api/v1/auth/super/users", headers=h, json={
                    "organization_id": org_id, "email": f"mgr-{tag}@example.invalid", "password": "Manager-" + tag,
                    "role": "admin"})
                check(r.status_code == 409, "занятый email (без учёта регистра) — 409")
                r = await c.patch(f"/api/v1/auth/super/users/{mgr_id}", headers=h, json={"role": "rop"})
                check(r.status_code == 200, "смена роли")

                r = await c.post(f"/api/v1/auth/super/users/{director_id}/impersonate", headers=h)
                check(r.status_code == 200 and r.json().get("access_token"), "вход как директор")
                user_token = r.json()["access_token"]
                r = await c.get("/api/v1/auth/verify", headers={"Authorization": "Bearer " + user_token})
                check(r.status_code == 200 and r.json()["payload"]["organization_id"] == org_id,
                      "токен директора принимается /verify")
                r = await c.get("/api/v1/auth/super/organizations", headers={"Authorization": "Bearer " + user_token})
                check(r.status_code in (401, 403), "токен кабинета не пускает в консоль")

                r = await c.patch(f"/api/v1/auth/super/organizations/{org_id}", headers=h, json={"is_active": False})
                check(r.status_code == 200, "отключение организации")
                r = await c.post("/api/v1/auth/login", json={"email": f"dir-{tag}@example.invalid",
                                                             "password": "Director-" + tag})
                check(r.status_code == 403, "вход в отключённую организацию — 403")

                me_id = (await c.get("/api/v1/auth/super/me", headers=h)).json()["id"]
                r = await c.patch(f"/api/v1/auth/super/admins/{me_id}", headers=h, json={"is_active": False})
                check(r.status_code == 409, "нельзя отключить себя")
        finally:
            app.dependency_overrides.clear()
            await session.close()
            await outer.rollback()
    print("\nИтог:", "всё в порядке" if not failures else f"ошибок {len(failures)}: " + "; ".join(failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
