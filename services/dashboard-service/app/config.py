from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dashboard_service:pass@localhost:5432/voiceiq"
    REDIS_URL: str = "redis://localhost:6379/0"
    RABBITMQ_URL: str = "amqp://voiceiq:pass@rabbitmq:5672/"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ANALYTICS_ENGINE_URL: str = "http://analytics-engine:8004"
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    SMTP_HOST: str = "smtp.yandex.ru"
    SMTP_PORT: int = 465
    SMTP_USER: str = "noreply@voiceiq.ru"
    SMTP_PASSWORD: str = "changeme_smtp"
    SMTP_FROM: str = "noreply@voiceiq.ru"
    CACHE_TTL_SECONDS: int = 300
    # Часовой пояс магазинов: по нему считаются получасы «Пульса недели»
    LOCAL_TZ: str = "Europe/Moscow"

    class Config:
        env_file = ".env"


settings = Settings()
