"""Нарезка транскрипта на истории и перевод на русский — через LLM.

Границы историй модель возвращает НЕ в секундах, а номерами сегментов ASR.
Так она физически не может выдумать несуществующий таймкод: любой номер
превращается в точное время начала/конца реального сегмента.
"""
import logging
import re

from app.config import settings
from app.llm import LLMError, chat_json, salvage_objects

logger = logging.getLogger(__name__)

SEGMENT_SYSTEM = (
    "Ты — редактор, который разбирает расшифровку выступления (стендап) на казахском языке. "
    "Тебе дают пронумерованные сегменты расшифровки с таймкодами. "
    "Твоя задача — выделить самостоятельные истории (блоки, байты): каждая история — это "
    "законченный сюжет или тема, которую комик рассказывает от завязки до панчлайна.\n\n"
    "Правила:\n"
    "1. Истории идут подряд и не пересекаются.\n"
    "2. Границы указывай номерами сегментов из входных данных, а не временем.\n"
    "3. Не выдумывай номера, которых нет во входных данных.\n"
    "4. Пропускай приветствия, представление и прощание — это не истории.\n"
    "5. Название давай на казахском (title) и его перевод на русский (title_ru).\n"
    "6. summary_ru — одно КОРОТКОЕ предложение на русском (не больше 15 слов).\n\n"
    "Отвечай СТРОГО одним JSON-объектом без пояснений:\n"
    '{"stories": [{"title": "...", "title_ru": "...", "summary_ru": "...", '
    '"start_index": 0, "end_index": 12}]}'
)

TRANSLATE_SYSTEM = (
    "Ты — переводчик с казахского на русский. Тебе дают пронумерованные строки расшифровки. "
    "Переведи КАЖДУЮ строку на русский, сохраняя нумерацию и разговорную интонацию. "
    "Не объединяй и не пропускай строки. Если строка неразборчива, верни её как есть.\n"
    'Отвечай СТРОГО одним JSON-объектом: {"items": [{"i": 0, "ru": "перевод"}]}'
)


_INDEX_PREFIX = re.compile(r"^\s*#\d+[\s.:)-]*")


def fmt_time(seconds: float) -> str:
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _render(segments: list[dict], offset: int) -> str:
    return "\n".join(
        f"#{offset + i} [{fmt_time(seg['start'])}] {seg['text']}"
        for i, seg in enumerate(segments)
    )


def _windows(segments: list[dict]) -> list[tuple[int, list[dict]]]:
    """Режет транскрипт на окна по объёму символов с перекрытием.

    Перекрытие нужно, чтобы история, попавшая на стык окон, не потерялась:
    в следующем окне она видна целиком и будет распознана там.
    """
    windows: list[tuple[int, list[dict]]] = []
    start = 0
    n = len(segments)
    while start < n:
        chars = 0
        end = start
        while end < n and chars < settings.SEGMENT_WINDOW_CHARS:
            chars += len(segments[end]["text"]) + 16
            end += 1
        windows.append((start, segments[start:end]))
        if end >= n:
            break
        start = max(start + 1, end - settings.SEGMENT_WINDOW_OVERLAP)
    return windows


async def split_into_stories(segments: list[dict]) -> list[dict]:
    """Возвращает [{title, title_ru, summary_ru, start_index, end_index}] без пересечений."""
    if not segments:
        return []

    raw_stories: list[dict] = []
    windows = _windows(segments)
    logger.info("Нарезка: %d сегментов -> %d окон", len(segments), len(windows))

    for offset, chunk in windows:
        user = (
            f"Сегменты расшифровки (#{offset}–#{offset + len(chunk) - 1}):\n\n"
            f"{_render(chunk, offset)}"
        )
        try:
            data = await chat_json(SEGMENT_SYSTEM, user)
            items = data.get("stories") or []
        except LLMError as exc:
            items = salvage_objects(exc.raw, ("title", "start_index", "end_index"))
            if items:
                logger.warning("Окно с #%d обрезано, спасено историй: %d", offset, len(items))
            else:
                logger.warning("Окно с #%d не разобрано: %s", offset, exc)
                continue

        for item in items:
            story = _clean_story(item, offset, offset + len(chunk) - 1)
            if story:
                raw_stories.append(story)

    return _dedupe(raw_stories, segments)


def _clean_story(item: object, lo: int, hi: int) -> dict | None:
    if not isinstance(item, dict):
        return None
    try:
        start = int(item.get("start_index"))
        end = int(item.get("end_index"))
    except (TypeError, ValueError):
        return None

    start, end = min(start, end), max(start, end)
    start = max(start, lo)
    end = min(end, hi)
    if start > end:
        return None

    title = str(item.get("title") or "").strip() or "Без названия"
    return {
        "title": title,
        "title_ru": str(item.get("title_ru") or "").strip() or None,
        "summary_ru": str(item.get("summary_ru") or "").strip() or None,
        "start_index": start,
        "end_index": end,
    }


def _dedupe(stories: list[dict], segments: list[dict]) -> list[dict]:
    """Убирает пересечения, оставшиеся от перекрытия окон, и слишком короткие истории."""
    stories.sort(key=lambda s: (s["start_index"], s["end_index"]))
    result: list[dict] = []
    covered_until = -1

    for story in stories:
        if story["start_index"] <= covered_until:
            # Пересечение с уже принятой историей — сдвигаем начало вперёд.
            story["start_index"] = covered_until + 1
            if story["start_index"] > story["end_index"]:
                continue

        duration = segments[story["end_index"]]["end"] - segments[story["start_index"]]["start"]
        if duration < settings.STORY_MIN_SEC:
            continue

        result.append(story)
        covered_until = story["end_index"]

    return result


async def _translate_indices(segments: list[dict], indices: list[int],
                             translations: list[str | None], batch: int) -> None:
    """Переводит указанные сегменты и раскладывает результат по их индексам."""
    for start in range(0, len(indices), batch):
        group = indices[start:start + batch]
        user = "\n".join(f"#{i} {segments[i]['text']}" for i in group)
        try:
            data = await chat_json(TRANSLATE_SYSTEM, user)
            items = data.get("items") or []
        except LLMError as exc:
            items = salvage_objects(exc.raw, ("i", "ru"))
            if not items:
                logger.warning("Перевод сегментов #%s не удался: %s", group[0], exc)
                continue

        allowed = set(group)
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                idx = int(item.get("i"))
            except (TypeError, ValueError):
                continue
            if idx in allowed:
                # На коротких пачках модель иногда копирует префикс "#12" в сам
                # перевод — срезаем, иначе он попадёт в интерфейс и выгрузку.
                ru = _INDEX_PREFIX.sub("", str(item.get("ru") or "")).strip()
                translations[idx] = ru or None


async def translate_segments(segments: list[dict]) -> list[str | None]:
    """Переводит сегменты на русский, сохраняя соответствие по индексам.

    Модель иногда молча возвращает меньше строк, чем просили, не сообщая об ошибке.
    Поэтому пропущенные индексы добираются повторными проходами всё меньшими
    пачками: на коротком запросе шанс потерять строку заметно ниже.
    """
    translations: list[str | None] = [None] * len(segments)
    batch = max(1, settings.TRANSLATE_BATCH)

    pending = list(range(len(segments)))
    for attempt in range(3):
        if not pending:
            break
        if attempt:
            batch = max(1, batch // 4)
            logger.info("Добираю %d непереведённых сегментов пачками по %d", len(pending), batch)
        await _translate_indices(segments, pending, translations, batch)
        pending = [i for i in pending if translations[i] is None]

    if pending:
        logger.warning("Без перевода осталось сегментов: %d", len(pending))
    return translations
