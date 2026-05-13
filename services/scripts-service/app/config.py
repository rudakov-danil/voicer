from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://scripts_service:pass@localhost:5432/voiceiq"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    ADMIN_SERVICE_URL: str = "http://admin-service:8007"
    TRANSCRIPTION_SERVICE_URL: str = "http://transcription-service:8003"
    INTERNAL_SERVICE_KEY: str = ""

    # LLM (для генерации шаблонов и live-теста)
    LLM_SERVER_URL: str = "http://localhost:11434"
    LLM_API_KEY: str = "ollama"
    LLM_EXTRA_HEADER_NAME: str = ""
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 2000
    LLM_TIMEOUT: int = 120

    class Config:
        env_file = ".env"


settings = Settings()
