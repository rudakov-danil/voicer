"""Создаёт технического администратора (суперадмина) или меняет ему пароль.

Пароль вводится с клавиатуры (getpass) и нигде не печатается. Запуск на сервере:
    cd ~/voiceiq && docker compose exec auth-service python create_super_admin.py admin@example.com
Дальше вход — консоль /api/v1/auth/console/<SUPER_CONSOLE_PATH>.
"""
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.database import async_session_maker
from app.models import SuperAdmin
from app.security import hash_password


async def main(email: str) -> int:
    email = email.strip().lower()
    if "@" not in email:
        print("Укажите email: python create_super_admin.py admin@example.com")
        return 2

    async with async_session_maker() as db:
        admin = (await db.execute(select(SuperAdmin).where(SuperAdmin.email == email))).scalar_one_or_none()
        print(f"{'Смена пароля' if admin else 'Новый технический администратор'}: {email}")
        password = getpass.getpass("Пароль (от 8 символов): ")
        if len(password) < 8:
            print("Слишком короткий пароль, ничего не изменено")
            return 1
        if getpass.getpass("Повторите пароль: ") != password:
            print("Пароли не совпадают, ничего не изменено")
            return 1

        if admin:
            admin.password_hash = hash_password(password)
            admin.is_active = True
        else:
            db.add(SuperAdmin(email=email, password_hash=hash_password(password)))
        await db.commit()
        print("Готово: пароль обновлён" if admin else "Готово: администратор создан")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "")))
