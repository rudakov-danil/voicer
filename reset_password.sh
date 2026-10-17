#!/bin/bash
# Новый пароль пользователю кабинета VoiceIQ. Пароль вводится скрыто и никуда не записывается.
# Запуск: bash ~/voiceiq/reset_password.sh admin@demo.ru
set -e
cd ~/voiceiq
CODE=$(cat <<'EOF'
import asyncio, getpass, sys
from sqlalchemy import text
from app.database import async_session_maker
from app.security import hash_password

email = sys.argv[1]
first = getpass.getpass(f"Новый пароль для {email}: ")
if len(first) < 8 or first != getpass.getpass("Ещё раз: "):
    sys.exit("Пароли не совпадают или короче 8 символов — ничего не изменено")

async def main():
    async with async_session_maker() as db:
        result = await db.execute(
            text("UPDATE auth.users SET password_hash = :hash, updated_at = now() WHERE email = :email"),
            {"hash": hash_password(first), "email": email})
        await db.commit()
    print("Пароль обновлён" if result.rowcount else "Пользователь не найден — ничего не изменено")

asyncio.run(main())
EOF
)
docker compose exec auth-service python -c "$CODE" "${1:?укажи email, например admin@demo.ru}"
