from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "voiceiq_admin"
    MINIO_SECRET_KEY: str = "changeme_minio"
    MINIO_SECURE: bool = False
    RABBITMQ_URL: str = "amqp://voiceiq:changeme@rabbitmq:5672/"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    DEEPGRAM_API_KEY: str = ""
    DEEPGRAM_API_URL: str = "https://api.deepgram.com/v1/listen"
    DEEPGRAM_LANGUAGE: str = "ru"
    DEEPGRAM_MODEL: str = "nova-3"
    # Если Deepgram уверен в спикере абзаца меньше этого, абзац режется на предложения,
    # и diarize-worker проверяет через LLM, кто их сказал (обычно это перебивания)
    SPEAKER_CONFIDENCE_MIN: float = 0.85
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
