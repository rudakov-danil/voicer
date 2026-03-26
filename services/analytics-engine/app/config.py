from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://analytics_service:pass@localhost:5432/voiceiq"
    RABBITMQ_URL: str = "amqp://voiceiq:pass@rabbitmq:5672/"
    LLM_SERVER_URL: str = "http://localhost:11434"
    LLM_API_KEY: str = "ollama"
    LLM_EXTRA_HEADER_NAME: str = ""
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 2000
    LLM_SCRIPT_TIMEOUT: int = 120
    LLM_GENERAL_TIMEOUT: int = 60
    LLM_MAX_PARALLEL_SCRIPTS: int = 3
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    SCRIPTS_SERVICE_URL: str = "http://scripts-service:8005"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    INTERNAL_SERVICE_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
