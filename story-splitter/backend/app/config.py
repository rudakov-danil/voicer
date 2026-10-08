from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- ASR (Deepgram) ---
    # nova-3 умеет kk/kk-KZ только в batch-режиме (streaming для казахского недоступен).
    DEEPGRAM_API_KEY: str = ""
    DEEPGRAM_API_URL: str = "https://api.deepgram.com/v1/listen"
    DEEPGRAM_MODEL: str = "nova-3"
    ASR_LANGUAGE: str = "kk"

    # --- LLM (OpenAI-совместимый эндпоинт: Yandex Cloud / OpenRouter / Ollama) ---
    LLM_SERVER_URL: str = "https://llm.api.cloud.yandex.net"
    LLM_API_KEY: str = ""
    LLM_FOLDER_ID: str = ""
    LLM_EXTRA_HEADER_NAME: str = ""
    LLM_EXTRA_HEADER_VALUE: str = ""
    LLM_MODEL_NAME: str = ""
    LLM_MAX_TOKENS: int = 8192
    LLM_TIMEOUT: float = 300.0
    # qwen3.6 у Yandex — reasoning-модель: без этого флага она тратит весь лимит
    # токенов на «размышление» и возвращает пустой content. Отключается через
    # reasoning_effort="none" — как в diarization.py основного стека.
    LLM_DISABLE_THINKING: bool = True

    # --- Нарезка на истории ---
    # Окно транскрипта, которое уходит в LLM за один вызов. Длинный стендап режется
    # на несколько окон с перекрытием, результаты потом склеиваются.
    SEGMENT_WINDOW_CHARS: int = 12000
    SEGMENT_WINDOW_OVERLAP: int = 6
    STORY_MIN_SEC: float = 20.0
    TRANSLATE_TO_RU: bool = True
    TRANSLATE_BATCH: int = 40

    # --- Хранилище ---
    DATA_DIR: Path = Path("/data")
    LOG_LEVEL: str = "INFO"

    @property
    def uploads_dir(self) -> Path:
        return self.DATA_DIR / "uploads"

    @property
    def stories_dir(self) -> Path:
        return self.DATA_DIR / "stories"

    @property
    def db_path(self) -> Path:
        return self.DATA_DIR / "story_splitter.db"

    class Config:
        env_file = ".env"


settings = Settings()

for _d in (settings.DATA_DIR, settings.uploads_dir, settings.stories_dir):
    _d.mkdir(parents=True, exist_ok=True)
