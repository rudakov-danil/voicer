"""Оркестрация: аудио -> транскрипция с таймкодами -> истории -> нарезка -> перевод."""
import logging
import re
from pathlib import Path

from app import asr, audio, db, segmenter
from app.config import settings

logger = logging.getLogger(__name__)


def _slug(text: str, limit: int = 40) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip()
    cleaned = re.sub(r"[\s_-]+", "-", cleaned)
    return (cleaned[:limit] or "story").strip("-").lower()


async def run(job_id: str, force_asr: bool = False) -> None:
    """Полный прогон. Любая ошибка помечает задачу как failed — воркер не падает.

    force_asr=False переиспользует уже сохранённую расшифровку: перезапуск после
    сбоя нарезки не гоняет длинный файл в платный ASR повторно.
    """
    job = await db.get_job(job_id)
    if job is None:
        logger.error("Задача %s не найдена", job_id)
        return

    src = Path(job["audio_path"])
    work_dir = settings.uploads_dir / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        segments = job.get("transcript") or []
        if segments and not force_asr:
            logger.info("Задача %s: переиспользую расшифровку (%d сегментов)", job_id, len(segments))
            await db.update_job(
                job_id, status="segmenting",
                stage_note=f"Расшифровка готова ({len(segments)} сегментов), ASR пропущен",
            )
        else:
            # 1. Длительность и нормализация под ASR
            await db.update_job(job_id, status="transcribing", stage_note="Подготовка аудио")
            duration = await audio.probe_duration(src)
            wav = await audio.to_wav_16k_mono(src, work_dir / "asr.wav")
            await db.update_job(job_id, duration_sec=duration)

            # 2. Транскрипция с таймкодами
            await db.update_job(
                job_id, stage_note=f"Распознавание речи ({segmenter.fmt_time(duration)})"
            )
            result = await asr.transcribe(wav)
            segments = result["segments"]
            if not segments:
                raise RuntimeError("ASR не вернул ни одного сегмента — проверь язык и качество записи")
            await db.update_job(
                job_id, language=result["language"], transcript=segments,
                stage_note=f"Распознано сегментов: {len(segments)}",
            )
            wav.unlink(missing_ok=True)

        # 3. Разбиение на истории
        await db.update_job(job_id, status="segmenting", stage_note="Поиск историй в расшифровке")
        stories = await segmenter.split_into_stories(segments)
        if not stories:
            raise RuntimeError("LLM не выделила ни одной истории — попробуй другое аудио или модель")
        await db.clear_stories(job_id)

        # 4. Нарезка аудио + перевод по каждой истории
        await db.update_job(job_id, status="cutting", stage_note=f"Нарезка {len(stories)} историй")
        stories_dir = settings.stories_dir / job_id
        stories_dir.mkdir(parents=True, exist_ok=True)

        for idx, story in enumerate(stories, start=1):
            story_segments = segments[story["start_index"]:story["end_index"] + 1]
            start_sec = story_segments[0]["start"]
            end_sec = story_segments[-1]["end"]

            clip = stories_dir / f"{idx:02d}-{_slug(story['title_ru'] or story['title'])}.mp3"
            await audio.cut(src, clip, start_sec, end_sec)

            payload = [
                {"start": s["start"], "end": s["end"], "text": s["text"], "text_ru": None}
                for s in story_segments
            ]
            story["_id"] = await db.add_story(
                job_id=job_id, idx=idx, title=story["title"], title_ru=story.get("title_ru"),
                summary_ru=story.get("summary_ru"), start_sec=start_sec, end_sec=end_sec,
                segments=payload, audio_path=str(clip),
            )
            story["_segments"] = payload

        # 5. Перевод расшифровки на русский (опционально)
        if settings.TRANSLATE_TO_RU:
            total = len(stories)
            for position, story in enumerate(stories, start=1):
                await db.update_job(
                    job_id, status="translating",
                    stage_note=f"Перевод истории {position} из {total}",
                )
                payload = story["_segments"]
                translations = await segmenter.translate_segments(payload)
                for seg, ru in zip(payload, translations):
                    seg["text_ru"] = ru
                await db.update_story(story["_id"], segments=payload)

        await db.update_job(job_id, status="done", stage_note=None, error=None)
        logger.info("Задача %s готова: %d историй", job_id, len(stories))

    except Exception as exc:                      # noqa: BLE001 — статус важнее типа ошибки
        logger.exception("Задача %s провалилась", job_id)
        await db.update_job(job_id, status="failed", error=str(exc), stage_note=None)
