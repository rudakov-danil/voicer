"""FastAPI-приложение: загрузка аудио, статус обработки, выдача историй."""
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import bundle, db, pipeline
from app.config import settings
from app.segmenter import fmt_time

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Story Splitter", version="1.0.0")

ALLOWED_SUFFIXES = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".webm", ".mp4"}
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
async def _startup() -> None:
    await db.init_db()
    logger.info("Хранилище готово: %s", settings.db_path)


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "asr_model": settings.DEEPGRAM_MODEL,
        "asr_language": settings.ASR_LANGUAGE,
        "asr_configured": bool(settings.DEEPGRAM_API_KEY),
        "llm_model": settings.LLM_MODEL_NAME,
        "llm_configured": bool(settings.LLM_API_KEY and settings.LLM_MODEL_NAME),
        "translate_to_ru": settings.TRANSLATE_TO_RU,
    }


@app.post("/api/jobs", status_code=201)
async def create_job(background: BackgroundTasks, file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Формат {suffix or '?'} не поддерживается. Доступны: "
                   f"{', '.join(sorted(ALLOWED_SUFFIXES))}",
        )

    stored = settings.uploads_dir / f"{uuid.uuid4()}{suffix}"
    with stored.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    if stored.stat().st_size == 0:
        stored.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Загружен пустой файл")

    job_id = await db.create_job(filename=file.filename or stored.name, audio_path=str(stored))
    background.add_task(pipeline.run, job_id)
    logger.info("Принято %s -> задача %s", file.filename, job_id)
    return {"id": job_id, "status": "queued"}


@app.get("/api/jobs")
async def list_jobs() -> list[dict]:
    return await db.list_jobs()


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    job = await db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    for story in job["stories"]:
        story["audio_url"] = f"/api/stories/{story['id']}/audio" if story.get("audio_path") else None
        story["duration_label"] = (
            f"{fmt_time(story['start_sec'])} – {fmt_time(story['end_sec'])}"
        )
    return job


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str) -> dict:
    job = await db.delete_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    Path(job["audio_path"]).unlink(missing_ok=True)
    shutil.rmtree(settings.uploads_dir / job_id, ignore_errors=True)
    shutil.rmtree(settings.stories_dir / job_id, ignore_errors=True)
    return {"deleted": job_id}


@app.post("/api/jobs/{job_id}/retry")
async def retry_job(job_id: str, background: BackgroundTasks, force_asr: bool = False) -> dict:
    job = await db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if job["status"] not in ("failed", "done"):
        raise HTTPException(status_code=409, detail="Задача ещё выполняется")

    await db.update_job(job_id, status="queued", error=None, stage_note=None)
    background.add_task(pipeline.run, job_id, force_asr)
    return {"id": job_id, "status": "queued", "force_asr": force_asr}


@app.get("/api/stories/{story_id}/audio")
async def story_audio(story_id: str) -> FileResponse:
    story = await db.get_story(story_id)
    if story is None:
        raise HTTPException(status_code=404, detail="История не найдена")

    path = Path(story["audio_path"] or "")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Аудиофайл истории не найден")
    return FileResponse(path, media_type="audio/mpeg", filename=path.name)


@app.get("/api/jobs/{job_id}/bundle")
async def bundle_job(job_id: str) -> FileResponse:
    """Офлайн-бандл: zip с самодостаточной HTML-страницей и аудио.

    Рассчитан на пересылку: получатель распаковывает и открывает index.html
    двойным кликом — ни сервера, ни интернета не требуется.
    """
    job = await db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if not job["stories"]:
        raise HTTPException(status_code=409, detail="У задачи нет историй — нечего выгружать")

    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in Path(job["filename"]).stem)[:60]
    dst = settings.DATA_DIR / "bundles" / f"{safe or 'stories'}.zip"
    dst.parent.mkdir(parents=True, exist_ok=True)
    bundle.build(job, dst)
    return FileResponse(dst, media_type="application/zip", filename=dst.name)


@app.get("/api/jobs/{job_id}/export")
async def export_job(job_id: str) -> JSONResponse:
    """Итоговый формат: название истории — аудио — расшифровка с таймкодами."""
    job = await db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    payload = {
        "source": job["filename"],
        "language": job["language"],
        "duration_sec": job["duration_sec"],
        "stories": [
            {
                "title": story["title"],
                "title_ru": story["title_ru"],
                "summary_ru": story["summary_ru"],
                "audio": Path(story["audio_path"]).name if story["audio_path"] else None,
                "audio_url": f"/api/stories/{story['id']}/audio",
                "start": fmt_time(story["start_sec"]),
                "end": fmt_time(story["end_sec"]),
                "transcript": [
                    {
                        "time": fmt_time(seg["start"]),
                        "start_sec": round(seg["start"], 2),
                        "end_sec": round(seg["end"], 2),
                        "text": seg["text"],
                        "text_ru": seg.get("text_ru"),
                    }
                    for seg in story["segments"]
                ],
            }
            for story in job["stories"]
        ],
    }
    return JSONResponse(
        payload,
        headers={"Content-Disposition": f'attachment; filename="{job_id}.json"'},
    )


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
