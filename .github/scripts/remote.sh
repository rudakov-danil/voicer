# Выполняется на сервере: ssh prod "APP_DIR=… SERVICES=… bash -s -- <этап>" < remote.sh
#   check   — состояние сервера, ничего не меняет
#   backup  — pg_dump в ~/deploy-backups, хранятся последние 10
#   apply   — сборка сервисов, миграции analytics-engine, перезапуск
#   verify  — новые эндпоинты отвечают через nginx
set -euo pipefail
cd "$APP_DIR"

if docker info >/dev/null 2>&1; then D=docker
elif sudo -n docker info >/dev/null 2>&1; then D="sudo -n docker"
else D=""; fi
if [ -n "$D" ] && $D compose version >/dev/null 2>&1; then DC="$D compose"
elif [ -n "$D" ] && command -v docker-compose >/dev/null; then DC="${D%docker}docker-compose"
else DC=""; fi
need_dc() { [ -n "$DC" ] || { echo "::error::У $(whoami) нет доступа к docker compose"; exit 1; }; }

# Код ответа nginx на путь (busybox wget пишет заголовки в stderr)
status() { $DC exec -T nginx wget -S -O /dev/null "http://localhost$1" 2>&1 | awk '/HTTP\//{print $2; exit}'; }

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
*)
  echo "Неизвестный этап: $1"
  exit 1
  ;;
esac
