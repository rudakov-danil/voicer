from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    INTERNAL_SERVICE_KEY: str = ""
    JWT_SECRET: str = "changeme"
    ADMIN_PANEL_PASSWORD: str = "admin"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
