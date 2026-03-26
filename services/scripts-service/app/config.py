from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://scripts_service:pass@localhost:5432/voiceiq"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    INTERNAL_SERVICE_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
