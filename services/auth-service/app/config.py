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
    # Витрины под отрасль: домен=slug организации (через запятую). Директор или админ
    # организации из DOMAIN_ORG_GUESTS (slug через запятую) на таком домене входит
    # сразу в организацию витрины: horeca.voicer-ai.pro открывает демо кофеен,
    # pharma.voicer-ai.pro и apteka.voicer-ai.pro — демо аптек (какой поддомен заведём, тот и заработает).
    DOMAIN_ORGS: str = ("horeca.voicer-ai.pro=horeca-demo,"
                        "pharma.voicer-ai.pro=pharmacy-demo,apteka.voicer-ai.pro=pharmacy-demo,"
                        "medicine.voicer-ai.pro=medicine-demo")
    DOMAIN_ORG_GUESTS: str = "demo"
    # Секретная часть адреса консоли суперадмина: /api/v1/auth/console/<SUPER_CONSOLE_PATH>.
    # Пусто — консоль выключена (API /super/* работает, страница отдаёт 404)
    SUPER_CONSOLE_PATH: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
