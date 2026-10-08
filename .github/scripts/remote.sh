# Выполняется на сервере: ssh prod "APP_DIR=… SERVICES=… bash -s -- <этап>" < remote.sh
#   check   — состояние сервера, ничего не меняет
#   backup  — pg_dump в ~/deploy-backups, хранятся последние 10
#   apply   — сборка сервисов, миграции analytics-engine, перезапуск
#   verify  — новые эндпоинты отвечают через nginx (без изменений на сервере)
#   reanalyze — повторный анализ записей ($REANALYZE) и ошибки воркера
#   llm-test — тестовый запрос к модели с текущими настройками .env
#   deepgram-test — распознавание примера Deepgram кодом recorder-service
#   logs    — ошибки сервисов $SERVICES за 30 минут, очереди, последние записи
#   rediarize — записи ($REANALYZE) или застрявшие за сутки снова в диаризацию и анализ
#   reprocess — записи ($REANALYZE) с нуля: Deepgram, диаризация, анализ
set -euo pipefail
cd "$APP_DIR"

if docker info >/dev/null 2>&1; then D=docker
elif sudo -n docker info >/dev/null 2>&1; then D="sudo -n docker"
else D=""; fi
if [ -n "$D" ] && $D compose version >/dev/null 2>&1; then DC="$D compose"
elif [ -n "$D" ] && command -v docker-compose >/dev/null; then DC="${D%docker}docker-compose"
else DC=""; fi
need_dc() { [ -n "$DC" ] || { echo "::error::У $(whoami) нет доступа к docker compose"; exit 1; }; }

# Код ответа nginx на путь (busybox wget пишет заголовки в stderr).
# 127.0.0.1, а не localhost: в alpine localhost — это ещё и ::1, а nginx слушает только IPv4.
status() { $DC exec -T nginx wget -S -O /dev/null "http://127.0.0.1$1" 2>&1 | awk '/HTTP\//{print $2; exit}'; }

case $1 in
check)
  set +e
  echo "== Сервер: $(hostname), $(uptime -p)"
  df -h / | tail -1
  free -m | sed -n 2p
  for c in git rsync node; do printf '%-6s %s\n' "$c" "$(command -v "$c" || echo нет)"; done
  echo "docker: ${D:-нет доступа}; compose: ${DC:-нет}"
  echo "== $APP_DIR (владелец $(stat -c %U .))"
  ls -la | head -40
  if [ -d .git ]; then
    echo "== git"
    git remote -v | head -2
    git log -1 --format='%h %ci %s'
    git status --short | head -20
  fi
  echo "== Переменные .env (только имена)"
  [ -f .env ] && grep -o '^[A-Z_][A-Z0-9_]*' .env | tr '\n' ' '
  echo
  echo "== Слушают порты"
  if command -v ss >/dev/null; then ss -ltn | awk 'NR>1{print $4}' | sort -u | tr '\n' ' '; else echo "нет ss"; fi
  echo
  if [ -n "$DC" ]; then
    echo "== Контейнеры"
    $DC ps
    echo "== Миграция analytics-engine"
    $DC exec -T analytics-engine alembic current 2>&1 | tail -2
  fi
  echo "== Фронтенд"
  ls -la --time-style=long-iso services/frontend/dist 2>&1 | head -6
  echo "index.html ссылается на: $(grep -oE '/assets/[^"]+' services/frontend/dist/index.html 2>/dev/null | tr '\n' ' ')"
  echo "Файлов в assets: $(find services/frontend/dist/assets -type f 2>/dev/null | wc -l)"
  find services/frontend/dist/assets -type f -printf '%f\n' 2>/dev/null | sort | head -80 | tr '\n' ' '
  echo
  echo "== Веб-сервер машины (80/443)"
  for c in nginx caddy apache2 haproxy traefik; do command -v "$c" >/dev/null && echo "$c: $(command -v "$c")"; done
  # sites-enabled — симлинки, поэтому -R
  grep -Rh -v '^[[:space:]]*#' /etc/nginx/nginx.conf /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
    | grep -oE '(server_name|listen|ssl_certificate|proxy_pass)[[:space:]][^;]+' | sort | uniq -c
  if [ -r /etc/caddy/Caddyfile ]; then grep -vE '^[[:space:]]*(#|$)' /etc/caddy/Caddyfile | head -30; fi
  true
  ;;
backup)
  need_dc
  dir=~/deploy-backups
  mkdir -p "$dir"
  f="$dir/voiceiq-$(date +%Y%m%d-%H%M%S).dump"
  $DC exec -T postgres pg_dump -U voiceiq -Fc voiceiq > "$f"
  echo "Бэкап: $f ($(du -h "$f" | cut -f1)), восстановление: pg_restore --clean -d voiceiq"
  ls -1t "$dir"/voiceiq-*.dump | tail -n +11 | xargs -r rm --
  ;;
apply)
  need_dc
  $DC build $SERVICES
  $DC run --rm -T analytics-engine alembic upgrade head
  $DC up -d $SERVICES
  # nginx запоминает адреса контейнеров при старте: после пересоздания перезапускаем
  $DC restart nginx
  ;;
verify)
  need_dc
  s=""
  for _ in $(seq 1 30); do
    s=$(status /api/v1/dashboard/overview/pulse || true)
    case $s in 401|403) break ;; esac
    sleep 3
  done
  echo "Новый эндпоинт /overview/pulse без входа: ${s:-нет ответа} (ждём 401 или 403, 404 — старый код)"
  echo "Главная: $(status / || true)"
  $DC exec -T analytics-engine alembic current 2>&1 | tail -1 || true
  $DC ps $SERVICES nginx
  if [ "$s" != 401 ] && [ "$s" != 403 ]; then
    $DC logs --tail=60 dashboard-service
    exit 1
  fi
  ;;
reanalyze)
  # REANALYZE: «--latest N» или id записей через пробел; ждём результат до 5 минут
  need_dc
  # shellcheck disable=SC2086
  $DC exec -T analytics-engine python -m worker.reanalyze $REANALYZE --wait 300 || true
  echo "== analytics-worker за 10 минут: ошибки и вызовы модели"
  $DC logs --since 10m --no-log-prefix analytics-worker 2>&1 \
    | grep -iE 'error|exception|traceback|failed|warn|llm|status code|analy[sz]ed' | tail -40 || true
  ;;
llm-test)
  # Отдельный контейнер с текущим .env: работающие сервисы не трогаем
  need_dc
  echo "== Откуда берутся настройки модели (ключи не показываем)"
  ls -la --time-style=long-iso .env* docker-compose.override.yml 2>/dev/null
  grep -nE '^[[:space:]]*(export[[:space:]]+)?LLM_(SERVER_URL|MODEL_NAME)=' .env 2>/dev/null
  echo "Строк LLM_API_KEY в .env: $(grep -cE '^[[:space:]]*(export[[:space:]]+)?LLM_API_KEY=' .env 2>/dev/null)"
  echo "LLM в docker-compose.override.yml:"; grep -n 'LLM' docker-compose.override.yml 2>/dev/null || echo "  нет"
  echo "LLM в окружении shell: $(env | grep -o '^LLM_[A-Z_]*' | tr '\n' ' ')"
  $DC run --rm -T --no-deps analytics-engine python - <<'PY' || true
import asyncio, time
from app.config import settings
from app.llm_client import get_llm_client

async def ask(**kw):
    t = time.monotonic()
    try:
        r = await get_llm_client().chat.completions.create(model=settings.LLM_MODEL_NAME, temperature=0, max_tokens=200, **kw)
    except Exception as e:
        print(f"  ошибка: {type(e).__name__}: {e}")
        return
    c = r.choices[0]
    print(f"  за {time.monotonic() - t:.1f} с, finish_reason={c.finish_reason}, модель в ответе: {r.model}")
    print(f"  ответ: {c.message.content!r}")
    print(f"  токены: {r.usage.prompt_tokens if r.usage else '?'} на входе, {r.usage.completion_tokens if r.usage else '?'} на выходе")

def key_format(k: str) -> str:
    # Только признаки формата, сам ключ не печатаем
    stray = any(ch in k for ch in " \t\"'")
    clean = k[9:].replace("-", "").isalnum() and k[9:].isascii()
    return (f"длина {len(k)}, начинается с sk-or-v1-: {k.startswith('sk-or-v1-')}, "
            f"пробелы или кавычки: {stray}, только латиница, цифры и дефис после префикса: {clean}")

async def main():
    print(f"Ключ: {key_format(settings.LLM_API_KEY)}")
    print(f"Сервер: {settings.LLM_SERVER_URL}, модель: {settings.LLM_MODEL_NAME}, "
          f"ключ задан: {bool(settings.LLM_API_KEY) and settings.LLM_API_KEY != 'ollama'}, folder задан: {bool(settings.LLM_FOLDER_ID)}")
    print("Обычный запрос:")
    await ask(messages=[{"role": "user", "content": "Ответь одним словом: столица Казахстана?"}])
    print("JSON-режим, как в анализе:")
    await ask(messages=[{"role": "system", "content": "Отвечай только JSON."},
                        {"role": "user", "content": 'Верни {"ok": true, "city": "<столица Казахстана>"}'}],
              response_format={"type": "json_object"})

asyncio.run(main())
PY
  ;;
deepgram-test)
  # Пример Deepgram через код recorder-service в работающем контейнере
  need_dc
  $DC exec -T recorder-service python - <<'PY' || true
import asyncio, time
import httpx
from app.config import settings
from app.deepgram_client import transcribe_audio, _language_params

async def main():
    print(f"Модель: {settings.DEEPGRAM_MODEL}, DEEPGRAM_LANGUAGE={settings.DEEPGRAM_LANGUAGE} -> {_language_params()}")
    async with httpx.AsyncClient(timeout=60) as c:
        audio = (await c.get("https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav")).content
    t = time.monotonic()
    try:
        r = await transcribe_audio(audio, "sample.wav")
    except httpx.HTTPStatusError as e:
        print("Ошибка Deepgram:", e.response.status_code, e.response.text[:500])
        return
    speakers = sorted({str(s.get("speaker")) for s in r["segments"]})
    print(f"За {time.monotonic() - t:.1f} с: язык {r['language']}, сегментов {len(r['segments'])}, спикеры {speakers}")
    print("Текст:", r["text"][:300])

asyncio.run(main())
PY
  ;;
rediarize)
  # REANALYZE с id записей — эти записи; иначе застрявшие до диаризации за сутки.
  # Диаризация сама ставит анализ; ждём новый разговор до 5 минут.
  need_dc
  $DC exec -T -e REANALYZE="$REANALYZE" diarize-worker python - <<'PY' || true
import asyncio, os, re, time, uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, text
from app.database import async_session_maker
from app.models import Transcript
from app import rabbitmq

async def main():
    ids = [uuid.UUID(x) for x in re.findall(r"[0-9a-f-]{36}", os.environ.get("REANALYZE", ""))]
    started = datetime.now(timezone.utc)
    async with async_session_maker() as db:
        q = select(Transcript)
        if ids:
            q = q.where(Transcript.recording_id.in_(ids))
        else:
            q = q.where(Transcript.status == "transcribed", Transcript.created_at >= started - timedelta(days=1))
        rows = (await db.execute(q.order_by(Transcript.created_at.desc()))).scalars().all()
    if not rows:
        print("Записей для диаризации нет")
        return
    for t in rows:
        print(f"В очередь диаризации: запись {t.recording_id} ({t.status}), расшифровка от {t.created_at:%Y-%m-%d %H:%M} UTC")
        await rabbitmq.publish("queue.diarize", {
            "recording_id": str(t.recording_id), "transcript_id": str(t.id), "seller_id": str(t.seller_id),
            "store_id": str(t.store_id), "organization_id": str(t.organization_id),
        })
    await rabbitmq.close()
    pending = {t.recording_id for t in rows}
    deadline = time.monotonic() + 300
    while pending and time.monotonic() < deadline:
        await asyncio.sleep(10)
        async with async_session_maker() as db:
            done = (await db.execute(text(
                "SELECT recording_id, outcome, overall_score, topic FROM analytics.conversations "
                "WHERE recording_id = ANY(:ids) AND analyzed_at > :t"), {"ids": list(pending), "t": started})).all()
        for r in done:
            score = f"{float(r.overall_score):.0f}" if r.overall_score is not None else "—"
            print(f"Готово: запись {r.recording_id}: исход {r.outcome}, балл {score}, тема «{r.topic or '—'}»")
            pending.discard(r.recording_id)
    for rid in pending:
        print(f"Не дождался анализа за 5 минут: запись {rid}")

asyncio.run(main())
PY
  echo "== diarize-worker и analytics-worker: ошибки за 10 минут"
  for svc in diarize-worker analytics-worker; do
    $DC logs --since 10m --no-log-prefix "$svc" 2>&1 \
      | grep -iE 'error|exception|traceback|denied|forbidden|40[13]|failed' | cut -c1-240 | tail -15 || true
  done
  ;;
worker-log)
  # Полный журнал сервисов за 15 минут, строки обрезаны. Лог запуска стоит удалить после чтения
  need_dc
  for svc in $SERVICES; do
    echo "== $svc"
    $DC logs --since 15m --no-log-prefix "$svc" 2>&1 | cut -c1-200 | tail -80 || true
  done
  ;;
conv-info)
  # Служебные поля последних разговоров, без текста
  need_dc
  $DC exec -T postgres psql -U voiceiq -d voiceiq -x -c "
    SELECT c.recording_id, c.analyzed_at, c.outcome, c.outcome_confidence, c.topic IS NOT NULL AS has_topic,
           c.call_category, c.is_scorable, c.llm_model, c.sentiment_avg, c.overall_score,
           (SELECT count(*) FROM transcription.transcript_segments s WHERE s.transcript_id = c.transcript_id) AS segments,
           (SELECT string_agg(r || ':' || n, ' ') FROM (SELECT s.speaker_role r, count(*) n FROM transcription.transcript_segments s
              WHERE s.transcript_id = c.transcript_id GROUP BY 1) x) AS roles,
           (SELECT length(t.full_text) FROM transcription.transcripts t WHERE t.id = c.transcript_id) AS text_len,
           (SELECT t.language FROM transcription.transcripts t WHERE t.id = c.transcript_id) AS lang,
           (SELECT count(*) FROM analytics.conversation_script_results r WHERE r.conversation_id = c.id) AS scripts,
           (SELECT count(*) FROM analytics.conversation_scores sc WHERE sc.conversation_id = c.id) AS step_scores
    FROM analytics.conversations c ORDER BY c.analyzed_at DESC LIMIT 4" 2>&1 || true
  ;;
reprocess)
  # Запись с нуля, как новая загрузка: аудио из MinIO -> Deepgram -> диаризация -> анализ.
  # REANALYZE: id записей или «--latest N». Старая расшифровка удаляется, разговор пересоздаёт анализ.
  need_dc
  $DC exec -T -e REANALYZE="$REANALYZE" recorder-service python - <<'PY' || true
import asyncio, os, re, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import text
from app.database import async_session_maker
from app.deepgram_client import _language_params
from app.minio_client import download_bytes
from app.rabbitmq import close as rabbitmq_close
from app.routers.upload import BUCKET, _transcribe_and_enqueue

COLS = "id, organization_id, store_id, seller_id, session_date, audio_path, source, created_at"

async def main():
    arg = os.environ.get("REANALYZE", "")
    ids = [uuid.UUID(x) for x in re.findall(r"[0-9a-f-]{36}", arg)]
    m = re.search(r"--latest (\d+)", arg)
    async with async_session_maker() as db:
        if ids:
            rows = (await db.execute(text(f"SELECT {COLS} FROM recorder.recordings WHERE id = ANY(:ids)"), {"ids": ids})).all()
        else:
            rows = (await db.execute(text(f"SELECT {COLS} FROM recorder.recordings ORDER BY created_at DESC LIMIT :n"),
                                     {"n": int(m.group(1)) if m else 1})).all()
    if not rows:
        print("Записи не найдены")
        return
    started = datetime.now(timezone.utc)
    print(f"Deepgram: {_language_params()}")
    for r in rows:
        obj = r.audio_path[len(BUCKET) + 1:] if r.audio_path.startswith(BUCKET + "/") else r.audio_path
        audio = await asyncio.to_thread(download_bytes, BUCKET, obj)
        ext = Path(obj).suffix or ".wav"
        async with async_session_maker() as db:
            await db.execute(text("DELETE FROM transcription.transcripts WHERE recording_id = :id"), {"id": r.id})
            await db.execute(text("UPDATE recorder.recordings SET status = 'processing', updated_at = now() WHERE id = :id"), {"id": r.id})
            await db.commit()
        print(f"Заново: запись {r.id} ({r.source}, загружена {r.created_at:%Y-%m-%d %H:%M} UTC, {len(audio)} байт, {ext})")
        await _transcribe_and_enqueue(r.id, audio, ext, str(r.organization_id), str(r.store_id),
                                      str(r.seller_id), str(r.session_date), r.audio_path)
    await rabbitmq_close()

    pending = {r.id for r in rows}
    deadline = time.monotonic() + 300
    while pending and time.monotonic() < deadline:
        await asyncio.sleep(10)
        async with async_session_maker() as db:
            done = (await db.execute(text("""
                SELECT c.recording_id, c.outcome, c.overall_score, c.topic, t.language,
                       (SELECT string_agg(x.r || ':' || x.n, ' ') FROM (
                          SELECT s.speaker_role r, count(*) n FROM transcription.transcript_segments s
                          WHERE s.transcript_id = t.id GROUP BY 1) x) AS roles,
                       (SELECT count(DISTINCT s.speaker_id) FROM transcription.transcript_segments s
                          WHERE s.transcript_id = t.id) AS speakers
                FROM analytics.conversations c JOIN transcription.transcripts t ON t.id = c.transcript_id
                WHERE c.recording_id = ANY(:ids) AND c.analyzed_at > :t"""), {"ids": list(pending), "t": started})).all()
        for d in done:
            score = f"{float(d.overall_score):.0f}" if d.overall_score is not None else "—"
            print(f"Готово: запись {d.recording_id}: язык {d.language}, спикеров Deepgram {d.speakers}, роли {d.roles}; "
                  f"исход {d.outcome}, балл {score}, тема «{d.topic or '—'}»")
            pending.discard(d.recording_id)
    for rid in pending:
        print(f"Не дождался анализа за 5 минут: запись {rid}")

asyncio.run(main())
PY
  echo "== recorder-service, diarize-worker, analytics-worker: ошибки за 10 минут"
  for svc in recorder-service diarize-worker analytics-worker; do
    $DC logs --since 10m --no-log-prefix "$svc" 2>&1 \
      | grep -iE 'error|exception|traceback|denied|forbidden|40[013]|failed' | cut -c1-240 | tail -15 || true
  done
  ;;
logs)
  # Ошибки сервисов за 30 минут, очереди и последние записи. Строки обрезаем: в логах бывает текст разговоров
  need_dc
  for svc in $SERVICES; do
    echo "== $svc: ошибки за 30 минут"
    $DC logs --since 30m --no-log-prefix "$svc" 2>&1 \
      | grep -iE 'error|exception|traceback|denied|forbidden|40[13]|failed|retry|requeue|timeout' | cut -c1-240 | tail -30 || true
  done
  echo "== Очереди RabbitMQ"
  $DC exec -T rabbitmq rabbitmqctl -q list_queues name messages messages_unacknowledged consumers 2>&1 | tail -20 || true
  echo "== Последние записи"
  $DC exec -T postgres psql -U voiceiq -d voiceiq -c \
    "SELECT id, status, created_at FROM recorder.recordings ORDER BY created_at DESC LIMIT 5" 2>&1 || true
  ;;
*)
  echo "Неизвестный этап: $1"
  exit 1
  ;;
esac
