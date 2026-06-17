from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://analytics_service:pass@localhost:5432/voiceiq"
    RABBITMQ_URL: str = "amqp://voiceiq:pass@rabbitmq:5672/"
    LLM_SERVER_URL: str = "http://localhost:11434"
    LLM_API_KEY: str = "ollama"
    LLM_FOLDER_ID: str = ""  # Yandex Cloud folder id (project) — пусто для OpenRouter/Ollama
    LLM_EXTRA_HEADER_NAME: str = ""
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = "qwen2.5:14b"
    # Необязательная дешёвая модель для тривиальных проходов (скрининг, анонимизация ПД).
    # Пусто → используется LLM_MODEL_NAME (поведение без изменений).
    LLM_CHEAP_MODEL: str = ""
    # Объединять общий анализ и комплаенс в один LLM-вызов (экономия токенов).
    # При любом сбое объединённого вызова код прозрачно откатывается на раздельные вызовы.
    LLM_MERGE_ANALYSIS: bool = True
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 2000
    # Потолок для скоринга полнотекстовых скриптов: ответ = по объекту на блок,
    # 18+ блоков с цитатами не влезают в 2000 → JSON обрывается. Реальный лимит
    # масштабируется по числу блоков, но не выше этого значения.
    LLM_FULLTEXT_MAX_TOKENS: int = 8000
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
