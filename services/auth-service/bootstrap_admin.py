"""Создаёт первого суперадмина и организацию из BOOTSTRAP_* env-переменных.
Идемпотентно: если пользователь с таким email уже есть — пропускает.
Запуск: docker compose run --rm auth-service python bootstrap_admin.py
"""
import asyncio
import os
import sys

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Organization, User
from app.security import hash_password


async def main() -> int:
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "").strip()
    org_name = os.environ.get("BOOTSTRAP_ORG_NAME", "Demo").strip()
    org_slug = os.environ.get("BOOTSTRAP_ORG_SLUG", "demo").strip()

    if not email or not password:
        print("[bootstrap] BOOTSTRAP_ADMIN_EMAIL или BOOTSTRAP_ADMIN_PASSWORD не заданы — пропускаю")
        return 0

    async with async_session_maker() as db:
        org = (await db.execute(
            select(Organization).where(Organization.slug == org_slug)
        )).scalar_one_or_none()

        if org is None:
            org = Organization(name=org_name, slug=org_slug)
            db.add(org)
            await db.flush()
            print(f"[bootstrap] Создана организация: {org_name} ({org_slug})")
        else:
            print(f"[bootstrap] Организация уже есть: {org.name}")

        existing_user = (await db.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()

        if existing_user is not None:
            print(f"[bootstrap] Пользователь {email} уже существует — пропускаю")
            return 0

        user = User(
            organization_id=org.id,
            email=email,
            password_hash=hash_password(password),
            role="director",
            first_name="Admin",
            last_name=org_name,
        )
        db.add(user)
        await db.commit()
        print(f"[bootstrap] Создан суперадмин: {email}")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
