# Выполняется на сервере: ssh prod "APP_DIR=… SERVICES=… bash -s -- <этап>" < remote.sh
#   check   — состояние сервера, ничего не меняет
#   backup  — pg_dump в ~/deploy-backups, хранятся последние 10
#   apply   — сборка сервисов, миграции analytics-engine, перезапуск
#   verify  — новые эндпоинты отвечают через nginx (без изменений на сервере)
#   reanalyze — повторный анализ записей ($REANALYZE) и ошибки воркера
#   llm-test — тестовый запрос к модели с текущими настройками .env
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
    return (f"длина {len(k)}, начинается с sk-or-v1-: {k.startswith('sk-or-v1-')}, "
            f"пробелы или кавычки: {any(ch in k for ch in ' \t\"' + chr(39))}, "
            f"только латиница, цифры и дефис после префикса: {k[9:].replace('-', '').isalnum() and k[9:].isascii()}")

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
*)
  echo "Неизвестный этап: $1"
  exit 1
  ;;
esac
