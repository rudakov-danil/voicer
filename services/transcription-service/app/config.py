from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "voiceiq_admin"
    MINIO_SECRET_KEY: str = "changeme_minio"
    MINIO_SECURE: bool = False
    RABBITMQ_URL: str = "amqp://voiceiq:changeme@rabbitmq:5672/"
    DEEPGRAM_API_KEY: str = ""
    DEEPGRAM_API_URL: str = "https://api.deepgram.com/v1/listen"
    DEEPGRAM_LANGUAGE: str = "ru"
    DEEPGRAM_MODEL: str = "nova-3"
    LLM_SERVER_URL: str = "http://llm-gpu-server:11434"
    LLM_API_KEY: str = "ollama"
    LLM_FOLDER_ID: str = ""  # Yandex Cloud folder id (project) — пусто для OpenRouter/Ollama
    LLM_EXTRA_HEADER_NAME: str = ""
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    # Рассуждения (thinking) выключены — см. app/llm_client.py
    LLM_DISABLE_THINKING: bool = True
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    INTERNAL_SERVICE_KEY: str = ""
    RECORDER_SERVICE_URL: str = "http://recorder-service:8002"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
