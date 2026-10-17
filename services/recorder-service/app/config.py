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
    # Распознавание речи: deepgram (по умолчанию) или openrouter — ElevenLabs Scribe v2 через OpenRouter.
    # STT_LANGUAGE — подсказка языка для OpenRouter (kk распознаёт и русский, и смешанную речь; auto — без подсказки)
    STT_PROVIDER: str = "deepgram"
    STT_MODEL: str = "elevenlabs/scribe-v2"
    STT_LANGUAGE: str = "kk"
    LLM_SERVER_URL: str = "https://openrouter.ai/api/v1"
    LLM_API_KEY: str = ""
    # DEEPGRAM_LANGUAGE=auto-ru-kk: русский, определённый Deepgram с такой уверенностью,
    # принимается без второго запроса с казахским
    DEEPGRAM_RU_DETECT_MIN: float = 0.9
    # Если Deepgram уверен в спикере абзаца меньше этого, абзац режется на предложения,
    # и diarize-worker проверяет через LLM, кто их сказал (обычно это перебивания)
    SPEAKER_CONFIDENCE_MIN: float = 0.85
    # Ручная загрузка: файл с несколькими разговорами режется на отдельные записи.
    # Границы ищет LLM в transcription-service (тот же segment_conversations, что у бейджа)
    SPLIT_MANUAL_UPLOADS: bool = True
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    INTERNAL_SERVICE_KEY: str = ""
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
