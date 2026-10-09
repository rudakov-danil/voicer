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
#   reupload — копии записей ($REANALYZE) как новые загрузки, исходные не меняются
#   roles-compare — роли по репликам: сохранённые, по Deepgram и от LLM
#   deepgram-words — сырой ответ Deepgram по записи: абзацы, utterances, слова (лог удалить после чтения)
#   deepgram-compare — запись в вариантах nova-3 / whisper / whisper-large (лог удалить после чтения)
#   llm-usage — расход токенов LLM по строкам «LLM usage» за 30 минут
#   summary-cost — токены на резюме последнего разговора (резюме не сохраняется)
#   roles-test — спикеры и роли кодом diarization.py из репозитория на сохранённой записи, без записи в базу
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

# Расход токенов по строкам «LLM usage» воркеров с момента $1 (время или длительность для docker logs --since)
llm_usage() {
  local svc
  for svc in diarize-worker analytics-worker analytics-engine transcription-worker; do
    $DC logs --since "$1" --no-log-prefix "$svc" 2>/dev/null | grep -F "LLM usage:" | sed "s/^/$svc /" || true
  done | awk '
    { svc = $1; step = "?"; p = c = t = 0; cost = ""
      for (i = 2; i <= NF; i++) {
        split($i, kv, "=")
        if (kv[1] == "step") step = kv[2]
        else if (kv[1] == "prompt") p = kv[2]
        else if (kv[1] == "completion") c = kv[2]
        else if (kv[1] == "total") t = kv[2]
        else if (kv[1] == "cost" && kv[2] != "None") cost = kv[2]
      }
      printf "  %-17s %-28s вход %6d  выход %5d  всего %6d  %s\n", svc, step, p, c, t, (cost == "" ? "" : "$" cost)
      P += p; C += c; T += t; n++
      if (cost != "") { S += cost; priced = 1 }
    }
    END {
      if (!n) { print "  Строк «LLM usage» нет"; exit }
      printf "Итого: запросов %d, вход %d, выход %d, всего %d токенов%s\n", n, P, C, T, (priced ? sprintf(", $%.5f", S) : "")
    }'
}

# Сколько токенов стоит резюме по кнопке на последнем разговоре: запрос к модели, ответ не сохраняется
summary_cost() {
  echo "== Резюме по кнопке на последнем разговоре: только подсчёт, не сохраняется"
  $DC exec -T analytics-engine python - <<'PY' 2>&1 | grep -v Warning || true
import asyncio, logging
from sqlalchemy import text
from app.config import settings
from app.database import AsyncSessionLocal
from app.llm_client import get_llm_client
from app.prompt_builder import build_summary_prompt

async def summary_on_click():
    async with AsyncSessionLocal() as db:
        c = (await db.execute(text("SELECT id, recording_id FROM analytics.conversations ORDER BY analyzed_at DESC LIMIT 1"))).first()
        rows = (await db.execute(text("""
            SELECT ts.speaker_role, ts.text, ts.start_ms FROM transcription.transcripts t
            JOIN transcription.transcript_segments ts ON ts.transcript_id = t.id
            WHERE t.recording_id = :r ORDER BY ts.segment_index"""), {"r": c.recording_id})).all()
        ctx = (await db.execute(text("SELECT source, call_direction FROM recorder.recordings WHERE id = :r"),
                                {"r": c.recording_id})).first()
    system, user = build_summary_prompt(
        [{"speaker_role": r.speaker_role, "text": r.text, "start_ms": r.start_ms or 0} for r in rows],
        {"source": ctx.source, "call_direction": ctx.call_direction} if ctx else None)
    r = await get_llm_client().chat.completions.create(
        model=settings.LLM_MODEL_NAME, temperature=0.2, timeout=settings.LLM_GENERAL_TIMEOUT,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
    print(f"Разговор {c.id}: резюме {len(r.choices[0].message.content or '')} символов")

logging.basicConfig(level=logging.WARNING)
logging.getLogger("app.llm_client").setLevel(logging.INFO)
asyncio.run(summary_on_click())
PY
}

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
    echo "== Миграция transcription"
    $DC exec -T transcription-service alembic current 2>&1 | tail -2
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
  # Схема transcription — из образа первого выкатываемого сервиса services/transcription-service.
  # Её колонки пишет и recorder-service, поэтому его выкатываем вместе с ними.
  for s in $SERVICES; do
    case $s in
      transcription-service|transcription-worker|diarize-worker)
        $DC run --rm -T "$s" alembic upgrade head
        break ;;
    esac
  done
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
        r = await get_llm_client().chat.completions.create(model=settings.LLM_MODEL_NAME, temperature=0, **kw)
    except Exception as e:
        print(f"  ошибка: {type(e).__name__}: {e}")
        return
    c = r.choices[0]
    print(f"  за {time.monotonic() - t:.1f} с, finish_reason={c.finish_reason}, модель в ответе: {r.model}")
    print(f"  ответ: {c.message.content!r}")
    print(f"  токены: {r.usage.prompt_tokens if r.usage else '?'} на входе, {r.usage.completion_tokens if r.usage else '?'} на выходе")
    print(f"  рассуждения в ответе: {'да' if getattr(c.message, 'reasoning', None) else 'нет'}")

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
reupload)
  # Копия записи как новая загрузка: новый id, аудио копируется в MinIO, время — сейчас.
  # Исходная запись не меняется. REANALYZE: id записей или «--latest N».
  # В конце — реплики без текста (спикер, уверенность, роль) и расход токенов LLM за прогон.
  need_dc
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  $DC exec -T -e REANALYZE="$REANALYZE" recorder-service python - <<'PY' || true
import asyncio, os, re, time, uuid
from datetime import date, datetime, timezone
from pathlib import Path
from sqlalchemy import text
from app.database import async_session_maker
from app.deepgram_client import _language_params
from app.minio_client import download_bytes, upload_bytes
from app.rabbitmq import close as rabbitmq_close
from app.routers.mobile import MIME_TYPES
from app.routers.upload import BUCKET, CONTENT_TYPE_MAP, _transcribe_and_enqueue

COLS = "id, organization_id, store_id, seller_id, audio_path, source, created_at"

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
    today = date.today()
    print(f"Deepgram: {_language_params()}")
    copies = {}
    for r in rows:
        obj = r.audio_path[len(BUCKET) + 1:] if r.audio_path.startswith(BUCKET + "/") else r.audio_path
        audio = await asyncio.to_thread(download_bytes, BUCKET, obj)
        ext = Path(obj).suffix or ".wav"
        new_id = uuid.uuid4()
        new_obj = f"{r.organization_id}/{r.store_id}/{r.seller_id}/{today}/{new_id}{ext}"
        ctype = MIME_TYPES.get(ext) or CONTENT_TYPE_MAP.get(ext, "application/octet-stream")
        await asyncio.to_thread(upload_bytes, BUCKET, new_obj, audio, ctype)
        new_path = f"{BUCKET}/{new_obj}"
        async with async_session_maker() as db:
            await db.execute(text("""
                INSERT INTO recorder.recordings
                    (id, organization_id, store_id, seller_id, device_id, session_date, started_at,
                     audio_path, file_size_bytes, status, source, created_at, updated_at)
                SELECT :new_id, organization_id, store_id, seller_id, device_id, :today, now(),
                       :path, :size, 'processing', source, now(), now()
                FROM recorder.recordings WHERE id = :src"""),
                {"new_id": new_id, "today": today, "path": new_path, "size": len(audio), "src": r.id})
            await db.commit()
        copies[new_id] = r.id
        print(f"Копия записи {r.id} ({r.source}, {len(audio)} байт, {ext}) -> новая запись {new_id}")
        await _transcribe_and_enqueue(new_id, audio, ext, str(r.organization_id), str(r.store_id),
                                      str(r.seller_id), str(today), new_path)
    await rabbitmq_close()

    pending = set(copies)
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
                WHERE c.recording_id = ANY(:ids)"""), {"ids": list(pending)})).all()
        for d in done:
            score = f"{float(d.overall_score):.0f}" if d.overall_score is not None else "—"
            print(f"Готово: новая запись {d.recording_id} (копия {copies[d.recording_id]}): язык {d.language}, "
                  f"спикеров Deepgram {d.speakers}, роли {d.roles}; исход {d.outcome}, балл {score}, тема «{d.topic or '—'}»")
            pending.discard(d.recording_id)
            async with async_session_maker() as db:
                segs = (await db.execute(text("""
                    SELECT s.segment_index, s.start_ms, s.end_ms, s.speaker_id, s.speaker_confidence, s.speaker_role
                    FROM transcription.transcript_segments s JOIN transcription.transcripts t ON t.id = s.transcript_id
                    WHERE t.recording_id = :id ORDER BY 1"""), {"id": d.recording_id})).all()
            for g in segs:
                conf = f"{float(g.speaker_confidence):.2f}" if g.speaker_confidence is not None else "—"
                print(f"  #{g.segment_index:<2} {g.start_ms / 1000:6.2f}-{g.end_ms / 1000:6.2f} с  спикер {g.speaker_id}  "
                      f"уверенность {conf:>4}  {g.speaker_role}")
    for rid in pending:
        print(f"Не дождался анализа за 5 минут: новая запись {rid}")

asyncio.run(main())
PY
  summary_cost
  echo "== Расход токенов LLM за прогон (с $since UTC)"
  llm_usage "$since"
  echo "== Проверка спикеров в diarize-worker"
  $DC logs --since "$since" --no-log-prefix diarize-worker 2>&1 | grep -E "Speaker recheck|Roles by|error" | cut -c1-200 || true
  ;;
llm-usage)
  need_dc
  llm_usage 30m
  ;;
summary-cost)
  need_dc
  summary_cost
  ;;
roles-test)
  # deploy.sh кладёт diarization.py из репозитория в /tmp/voicer-diarization-test.py; прогоняем его
  # на сохранённой записи $REANALYZE внутри diarize-worker. В базу ничего не пишется, текст не выводится
  need_dc
  $DC cp /tmp/voicer-diarization-test.py diarize-worker:/tmp/diarization_test.py
  $DC exec -T -e REANALYZE="$REANALYZE" diarize-worker python - <<'PY' 2>&1 | grep -v Warning || true
import asyncio, importlib.util, logging, os, re, uuid
import httpx
from sqlalchemy import select
from app.config import settings
from app.database import async_session_maker
from app.llm_client import get_llm_client
from app.models import Transcript, TranscriptSegment

logging.basicConfig(level=logging.WARNING, format="%(message)s")
for name in ("app.llm_client", "diarization_test"):
    logging.getLogger(name).setLevel(logging.INFO)
spec = importlib.util.spec_from_file_location("diarization_test", "/tmp/diarization_test.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


async def seller_name_for(seller_id) -> str:
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            r = await http.get(f"{settings.ADMIN_SERVICE_URL}/api/v1/admin/sellers/{seller_id}",
                               headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY})
        if r.status_code == 200:
            full = f"{r.json().get('first_name', '')} {r.json().get('last_name', '')}".strip()
            if full:
                return full
    except Exception as e:
        print(f"Имя продавца не получено: {type(e).__name__}")
    return "Продавец"


async def main():
    rid = uuid.UUID(re.findall(r"[0-9a-f-]{36}", os.environ["REANALYZE"])[0])
    async with async_session_maker() as db:
        t = (await db.execute(select(Transcript).where(Transcript.recording_id == rid))).scalar_one()
        segs = (await db.execute(select(TranscriptSegment).where(TranscriptSegment.transcript_id == t.id)
                                 .order_by(TranscriptSegment.segment_index))).scalars().all()
    name = await seller_name_for(t.seller_id)
    words = " ".join(s.text for s in segs).lower()
    print(f"Имя продавца в профиле: {'есть' if name != 'Продавец' else 'нет'}, "
          f"первое слово имени есть в тексте: {'да' if name.split()[0].lower() in words else 'нет'}")
    dicts = [{"text": s.text, "start_ms": s.start_ms, "end_ms": s.end_ms, "speaker_id": s.speaker_id,
              "speaker_confidence": s.speaker_confidence} for s in segs]
    await run("Без рассуждений модели, как в проде", segs, dicts, name)
    # Второй проход — с рассуждениями (thinking): сколько стоят и меняют ли ответ
    settings.LLM_DISABLE_THINKING = False

    async def with_reasoning(client, **kwargs):
        return await client.chat.completions.create(**kwargs)

    d._create_no_reasoning = with_reasoning
    await run("С рассуждениями модели", segs, dicts, name)


async def run(label, segs, dicts, name):
    print(f"== {label}")
    res = await d.resolve_speakers_and_roles(dicts, name, get_llm_client())
    if res is None:
        print("Модель не назвала работника: роли определились бы отдельным запросом, как раньше")
        return
    print(" #  начало-конец, с  уверенность  сохранено: спикер, роль  новое: спикер, роль")
    for i, (s, sid, role) in enumerate(zip(segs, *res)):
        conf = f"{float(s.speaker_confidence):.2f}" if s.speaker_confidence is not None else "—"
        print(f"{i:2}  {s.start_ms / 1000:6.2f}-{s.end_ms / 1000:6.2f}  {conf:>4}  "
              f"{s.speaker_id} {s.speaker_role:9}  {sid} {role}")

asyncio.run(main())
PY
  $DC exec -T diarize-worker rm -f /tmp/diarization_test.py || true
  rm -f /tmp/voicer-diarization-test.py
  ;;
roles-compare)
  # Роли по репликам: сохранённые, по правилу Deepgram (дольше всех говорит — продавец) и от LLM. Без текста
  need_dc
  $DC exec -T -e REANALYZE="$REANALYZE" diarize-worker python - <<'PY' || true
import asyncio, os, re, uuid
from sqlalchemy import select
from app.database import async_session_maker
from app.diarization import identify_speaker_roles, roles_by_talk_time
from app.llm_client import get_llm_client
from app.models import Transcript, TranscriptSegment
import worker.diarize_worker as w

async def main():
    print(f"ROLES_BY_LLM в работающем diarize-worker: {w.ROLES_BY_LLM}")
    ids = [uuid.UUID(x) for x in re.findall(r"[0-9a-f-]{36}", os.environ.get("REANALYZE", ""))]
    async with async_session_maker() as db:
        q = select(Transcript)
        q = q.where(Transcript.recording_id.in_(ids)) if ids else q.order_by(Transcript.created_at.desc()).limit(1)
        for t in (await db.execute(q)).scalars().all():
            segs = (await db.execute(select(TranscriptSegment).where(TranscriptSegment.transcript_id == t.id)
                                     .order_by(TranscriptSegment.segment_index))).scalars().all()
            d = [{"text": s.text, "start_ms": s.start_ms, "end_ms": s.end_ms, "speaker_id": s.speaker_id} for s in segs]
            dg = roles_by_talk_time(d)
            llm_map = await identify_speaker_roles(d, "Продавец", get_llm_client())
            llm = [llm_map.get(x["speaker_id"], "unknown") for x in d]
            print(f"== запись {t.recording_id}, расшифровка от {t.created_at:%Y-%m-%d %H:%M} UTC, язык {t.language}")
            print(" #  спикер  начало-конец, с   сохранено  Deepgram  LLM")
            for i, (s, a, b) in enumerate(zip(segs, dg, llm)):
                print(f"{i:2}  {str(s.speaker_id):6}  {s.start_ms / 1000:6.1f}-{s.end_ms / 1000:6.1f}  "
                      f"{s.speaker_role:9}  {a:8}  {b}")
            same = sum(s.speaker_role == a for s, a in zip(segs, dg))
            print(f"Сохранённые роли совпадают с Deepgram-правилом в {same} из {len(segs)}, "
                  f"Deepgram и LLM расходятся в {sum(a != b for a, b in zip(dg, llm))}")

asyncio.run(main())
PY
  ;;
deepgram-words)
  # Сырой ответ Deepgram для записи: абзацы, utterances и слова со спикерами в окне 15–30 с.
  # В логе будут слова записи — лог запуска удалить после чтения. REANALYZE: id записи или «--latest 1»
  need_dc
  $DC exec -T -e REANALYZE="$REANALYZE" recorder-service python - <<'PY' || true
import asyncio, os, re, uuid
import httpx
from sqlalchemy import text
from app.config import settings
from app.database import async_session_maker
from app.deepgram_client import _language_params
from app.minio_client import download_bytes
from app.routers.mobile import MIME_TYPES
from app.routers.upload import BUCKET, CONTENT_TYPE_MAP
from pathlib import Path

async def main():
    ids = [uuid.UUID(x) for x in re.findall(r"[0-9a-f-]{36}", os.environ.get("REANALYZE", ""))]
    async with async_session_maker() as db:
        if ids:
            r = (await db.execute(text("SELECT id, audio_path FROM recorder.recordings WHERE id = :id"), {"id": ids[0]})).first()
        else:
            r = (await db.execute(text("SELECT id, audio_path FROM recorder.recordings ORDER BY created_at DESC LIMIT 1"))).first()
    obj = r.audio_path[len(BUCKET) + 1:]
    ext = Path(obj).suffix
    audio = await asyncio.to_thread(download_bytes, BUCKET, obj)
    params = {"smart_format": "true", **_language_params(), "model": settings.DEEPGRAM_MODEL,
              "diarize_model": "latest", "paragraphs": "true", "utterances": "true"}
    print(f"Запись {r.id}, {len(audio)} байт; параметры {params}")
    async with httpx.AsyncClient(timeout=300) as c:
        resp = await c.post(settings.DEEPGRAM_API_URL, params=params, content=audio, headers={
            "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
            "Content-Type": MIME_TYPES.get(ext) or CONTENT_TYPE_MAP.get(ext, "application/octet-stream")})
    resp.raise_for_status()
    res = resp.json()["results"]
    ch = res["channels"][0]
    alt = ch["alternatives"][0]
    print(f"Язык: {ch.get('detected_language')}, уверенность {ch.get('language_confidence')}")
    print("== Абзацы (из них мы режем реплики)")
    for p in (alt.get("paragraphs") or {}).get("paragraphs", []):
        print(f"  {p['start']:6.2f}-{p['end']:6.2f}  спикер {p.get('speaker')}  предложений {len(p.get('sentences', []))}")
    print("== Utterances")
    for u in res.get("utterances", []):
        print(f"  {u['start']:6.2f}-{u['end']:6.2f}  спикер {u.get('speaker')}  слов {len(u.get('words', []))}")
    print("== Слова 15–30 с: начало-конец, спикер, уверенность спикера, слово")
    for w in alt.get("words", []):
        if 15 <= w["start"] <= 30:
            print(f"  {w['start']:6.2f}-{w['end']:6.2f}  {w.get('speaker')}  {w.get('speaker_confidence', 0):.2f}  {w.get('punctuated_word') or w['word']}")

asyncio.run(main())
PY
  ;;
deepgram-compare)
  # Одна запись в нескольких вариантах Deepgram: nova-3 с автоопределением и whisper с ru.
  # В логе слова записи — лог запуска удалить после чтения. REANALYZE: id записи или «--latest 1»
  need_dc
  $DC exec -T -e REANALYZE="$REANALYZE" recorder-service python - <<'PY' || true
import asyncio, os, re, time, uuid
from pathlib import Path
import httpx
from sqlalchemy import text
from app.config import settings
from app.database import async_session_maker
from app.minio_client import download_bytes
from app.routers.mobile import MIME_TYPES
from app.routers.upload import BUCKET, CONTENT_TYPE_MAP

BASE = {"smart_format": "true", "paragraphs": "true", "utterances": "true"}
VARIANTS = [
    ("nova-3, автоопределение", {"model": "nova-3", "detect_language": "true", "diarize_model": "latest"}),
    ("whisper, ru", {"model": "whisper", "language": "ru", "diarize_model": "latest"}),
    ("whisper-large, ru", {"model": "whisper-large", "language": "ru", "diarize_model": "latest"}),
]

async def call(c, audio, ctype, params):
    return await c.post(settings.DEEPGRAM_API_URL, params=params, content=audio,
                        headers={"Authorization": f"Token {settings.DEEPGRAM_API_KEY}", "Content-Type": ctype})

async def main():
    ids = [uuid.UUID(x) for x in re.findall(r"[0-9a-f-]{36}", os.environ.get("REANALYZE", ""))]
    async with async_session_maker() as db:
        q = "SELECT id, audio_path FROM recorder.recordings " + ("WHERE id = :id" if ids else "ORDER BY created_at DESC LIMIT 1")
        r = (await db.execute(text(q), {"id": ids[0]} if ids else {})).first()
    obj = r.audio_path[len(BUCKET) + 1:]
    ext = Path(obj).suffix
    ctype = MIME_TYPES.get(ext) or CONTENT_TYPE_MAP.get(ext, "application/octet-stream")
    audio = await asyncio.to_thread(download_bytes, BUCKET, obj)
    print(f"Запись {r.id}, {len(audio)} байт, {ext}")
    async with httpx.AsyncClient(timeout=600) as c:
        for name, extra in VARIANTS:
            params = {**BASE, **extra}
            t = time.monotonic()
            resp = await call(c, audio, ctype, params)
            if resp.status_code == 400 and "diarize" in resp.text:
                print(f"\n#### {name}: diarize_model не принят ({resp.text[:160]}), пробую diarize=true")
                params = {**BASE, **{k: v for k, v in extra.items() if k != "diarize_model"}, "diarize": "true"}
                resp = await call(c, audio, ctype, params)
            print(f"\n#### {name}: {params}")
            if resp.status_code != 200:
                print(f"Ошибка {resp.status_code}: {resp.text[:300]}")
                continue
            res = resp.json()["results"]
            ch = res["channels"][0]
            alt = ch["alternatives"][0]
            words = alt.get("words", [])
            print(f"За {time.monotonic() - t:.1f} с; язык {ch.get('detected_language') or params.get('language')}; "
                  f"спикеров {len({w.get('speaker') for w in words if w.get('speaker') is not None})}")
            print("Абзацы:")
            for p in (alt.get("paragraphs") or {}).get("paragraphs", []):
                print(f"  {p['start']:6.2f}-{p['end']:6.2f}  спикер {p.get('speaker')}")
            print("Слова 15–31 с:")
            for w in words:
                if 15 <= w["start"] <= 31:
                    print(f"  {w['start']:6.2f}-{w['end']:6.2f}  {w.get('speaker')}  {w.get('speaker_confidence', 0):.2f}  {w.get('punctuated_word') or w['word']}")

asyncio.run(main())
PY
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
