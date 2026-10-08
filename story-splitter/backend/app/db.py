"""SQLite-хранилище. Отдельная база — модуль намеренно не трогает основной Postgres Voicer."""
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import aiosqlite

from app.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    audio_path      TEXT NOT NULL,
    status          TEXT NOT NULL,          -- queued | transcribing | segmenting | cutting | translating | done | failed
    stage_note      TEXT,
    error           TEXT,
    language        TEXT,
    duration_sec    REAL,
    transcript      TEXT,                   -- JSON: список сегментов ASR
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
    id          TEXT PRIMARY KEY,
    job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    title_ru    TEXT,
    summary_ru  TEXT,
    start_sec   REAL NOT NULL,
    end_sec     REAL NOT NULL,
    audio_path  TEXT,
    segments    TEXT NOT NULL,              -- JSON: сегменты истории с таймкодами
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_job ON stories(job_id, idx);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def init_db() -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def create_job(filename: str, audio_path: str) -> str:
    job_id = str(uuid.uuid4())
    ts = _now()
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "INSERT INTO jobs (id, filename, audio_path, status, created_at, updated_at)"
            " VALUES (?, ?, ?, 'queued', ?, ?)",
            (job_id, filename, audio_path, ts, ts),
        )
        await db.commit()
    return job_id


async def update_job(job_id: str, **fields: Any) -> None:
    if not fields:
        return
    if "transcript" in fields and not isinstance(fields["transcript"], str):
        fields["transcript"] = json.dumps(fields["transcript"], ensure_ascii=False)
    fields["updated_at"] = _now()
    assignments = ", ".join(f"{k} = ?" for k in fields)
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            f"UPDATE jobs SET {assignments} WHERE id = ?", (*fields.values(), job_id)
        )
        await db.commit()


async def add_story(job_id: str, idx: int, title: str, start_sec: float, end_sec: float,
                    segments: list[dict], title_ru: str | None = None,
                    summary_ru: str | None = None, audio_path: str | None = None) -> str:
    story_id = str(uuid.uuid4())
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "INSERT INTO stories (id, job_id, idx, title, title_ru, summary_ru, start_sec,"
            " end_sec, audio_path, segments, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (story_id, job_id, idx, title, title_ru, summary_ru, start_sec, end_sec,
             audio_path, json.dumps(segments, ensure_ascii=False), _now()),
        )
        await db.commit()
    return story_id


async def update_story(story_id: str, **fields: Any) -> None:
    if not fields:
        return
    if "segments" in fields and not isinstance(fields["segments"], str):
        fields["segments"] = json.dumps(fields["segments"], ensure_ascii=False)
    assignments = ", ".join(f"{k} = ?" for k in fields)
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            f"UPDATE stories SET {assignments} WHERE id = ?", (*fields.values(), story_id)
        )
        await db.commit()


async def clear_stories(job_id: str) -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute("DELETE FROM stories WHERE job_id = ?", (job_id,))
        await db.commit()


def _job_row(row: aiosqlite.Row) -> dict:
    job = dict(row)
    job["transcript"] = json.loads(job["transcript"]) if job.get("transcript") else []
    return job


async def list_jobs() -> list[dict]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT j.*, (SELECT COUNT(*) FROM stories s WHERE s.job_id = j.id) AS stories_count"
            " FROM jobs j ORDER BY j.created_at DESC"
        )
        rows = await cur.fetchall()
    result = []
    for row in rows:
        job = dict(row)
        job.pop("transcript", None)   # в списке транскрипт не нужен — он тяжёлый
        result.append(job)
    return result


async def get_job(job_id: str) -> dict | None:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cur.fetchone()
        if row is None:
            return None
        job = _job_row(row)

        cur = await db.execute(
            "SELECT * FROM stories WHERE job_id = ? ORDER BY idx", (job_id,)
        )
        stories = []
        for srow in await cur.fetchall():
            story = dict(srow)
            story["segments"] = json.loads(story["segments"])
            stories.append(story)
    job["stories"] = stories
    return job


async def get_story(story_id: str) -> dict | None:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM stories WHERE id = ?", (story_id,))
        row = await cur.fetchone()
    if row is None:
        return None
    story = dict(row)
    story["segments"] = json.loads(story["segments"])
    return story


async def delete_job(job_id: str) -> dict | None:
    job = await get_job(job_id)
    if job is None:
        return None
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute("DELETE FROM stories WHERE job_id = ?", (job_id,))
        await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await db.commit()
    return job
