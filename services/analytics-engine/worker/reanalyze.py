"""Повторный анализ записей из командной строки, без входа в интерфейс.

Делает то же, что POST /reanalyze/{recording_id}: удаляет результаты скриптов
и ставит запись в очередь queue.analyze. Запускать внутри контейнера analytics-engine:

    python -m worker.reanalyze --latest 1            # последний разговор
    python -m worker.reanalyze <recording_id> ...    # конкретные записи
    python -m worker.reanalyze --latest 1 --wait 300 # и дождаться результата
"""
import argparse
import asyncio
import time
import uuid

from sqlalchemy import delete, select

from app import rabbitmq
from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Conversation, ConversationScriptResult


def _describe(c: Conversation) -> str:
    score = f"{float(c.overall_score):.0f}" if c.overall_score is not None else "—"
    return (f"исход {c.outcome}, балл {score}, тема «{c.topic or '—'}», "
            f"модель {c.llm_model or '—'}, статус {c.status}")


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Повторный анализ записей")
    parser.add_argument("recording_ids", nargs="*", type=uuid.UUID)
    parser.add_argument("--latest", type=int, default=0, help="взять N последних разговоров")
    parser.add_argument("--wait", type=int, default=0, help="сколько секунд ждать результата")
    args = parser.parse_args(argv)
    if not args.recording_ids and not args.latest:
        parser.error("укажите recording_id или --latest N")

    print(f"Модель: {settings.LLM_MODEL_NAME}, сервер: {settings.LLM_SERVER_URL}")

    async with AsyncSessionLocal() as db:
        query = select(Conversation)
        if args.recording_ids:
            query = query.where(Conversation.recording_id.in_(args.recording_ids))
        else:
            query = query.order_by(Conversation.analyzed_at.desc()).limit(args.latest)
        convs = (await db.execute(query)).scalars().all()
        if not convs:
            print("Разговоры не найдены")
            return 1
        for c in convs:
            await db.execute(delete(ConversationScriptResult).where(ConversationScriptResult.conversation_id == c.id))
        await db.commit()

    # Воркер при повторном анализе пересоздаёт разговор: смотрим, сменился ли id или время анализа
    before = {c.recording_id: (c.id, c.analyzed_at) for c in convs}
    for c in convs:
        print(f"В очередь: запись {c.recording_id}, {c.session_date}; было: {_describe(c)}")
        await rabbitmq.publish("queue.analyze", {
            "recording_id": str(c.recording_id),
            "transcript_id": str(c.transcript_id),
            "seller_id": str(c.seller_id),
            "store_id": str(c.store_id),
            "organization_id": str(c.organization_id),
        })
    await rabbitmq.close()

    deadline = time.monotonic() + args.wait
    pending = set(before)
    while pending and time.monotonic() < deadline:
        await asyncio.sleep(5)
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Conversation).where(Conversation.recording_id.in_(pending))
            )).scalars().all()
        for c in rows:
            old_id, old_at = before[c.recording_id]
            if c.id != old_id or c.analyzed_at > old_at:
                print(f"Готово: запись {c.recording_id}; стало: {_describe(c)}")
                pending.discard(c.recording_id)
    for rid in pending:
        print(f"Не дождался результата за {args.wait} с: запись {rid}")
    return 1 if pending and args.wait else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
