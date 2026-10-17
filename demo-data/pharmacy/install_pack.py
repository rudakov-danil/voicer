"""Ставит отраслевой пакет «Аптечная сеть» в демо-организацию (запускать в контейнере scripts-service):
скрипт фармацевта, правила допродаж, типы возражений и правила общения; отрасль организации — pharmacy.
  python install_pack.py <organization_id> <user_id>
"""
import asyncio
import sys

from app.database import AsyncSessionLocal
from app.routers.verticals import InstallRequest, install_vertical

ORG_ID, SYSTEM_USER = sys.argv[1], sys.argv[2]


async def main():
    user = {"organization_id": ORG_ID, "role": "director", "sub": SYSTEM_USER}
    async with AsyncSessionLocal() as db:
        result = await install_vertical("pharmacy", InstallRequest(activate_script=True, set_industry=True), user=user, db=db)
    print(result)


asyncio.run(main())
