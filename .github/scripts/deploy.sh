#!/usr/bin/env bash
# Выкатка на прод с раннера GitHub Actions (.github/workflows/deploy.yml).
# Ждёт Host prod в ~/.ssh/config и собранный services/frontend/dist.
#   deploy.sh check   — ничего не меняет на сервере
#   deploy.sh deploy  — бэкап, файлы, сборка, миграции, перезапуск, фронтенд
set -euo pipefail

MODE=${1:?check или deploy}
: "${APP_DIR:?}" "${SERVICES:?}"
[[ $SERVICES =~ ^[a-z0-9\ -]+$ ]] || { echo "::error::Странный список сервисов: $SERVICES"; exit 1; }

cd "$(dirname "$0")/../.."

# Скрипт remote.sh выполняется на сервере с одним аргументом — этапом
remote() {
  ssh prod "APP_DIR=$(printf %q "$APP_DIR") SERVICES=$(printf %q "$SERVICES") bash -s -- $1" < .github/scripts/remote.sh
}

# Исходники services/ без зависимостей, кэшей и сборки фронтенда.
# Без --delete: файлы, которые есть только на сервере, не трогаем.
SYNC=(-rlc --exclude=node_modules/ --exclude=__pycache__/ --exclude='*.pyc' --exclude=.venv/ --exclude=venv/
      --exclude=.pytest_cache/ --exclude=.env --exclude=/frontend/dist/)
# Старые чанки фронтенда оставляем: открытые вкладки ещё могут их запросить
DIST=(-rlc)

case $MODE in
  check)
    remote check
    echo "== Изменится в services/"
    rsync "${SYNC[@]}" -n -i services/ prod:"$APP_DIR/services/" | grep -v '^\.' | head -300 || true
    echo "== Изменится файлов фронтенда: $(rsync "${DIST[@]}" -n -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/" | grep -vc '^\.' || true)"
    for f in docker-compose.yml nginx/nginx.conf; do
      echo "== Отличия $f (сервер → репозиторий, не синхронизируется)"
      ssh prod cat "$APP_DIR/$f" 2>/dev/null | diff -u - "$f" | head -120 || true
    done
    ;;
  deploy)
    remote backup
    rsync "${SYNC[@]}" -i services/ prod:"$APP_DIR/services/"
    remote apply
    rsync "${DIST[@]}" -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/"
    remote verify
    ;;
  *)
    echo "::error::Неизвестный режим: $MODE"
    exit 1
    ;;
esac
