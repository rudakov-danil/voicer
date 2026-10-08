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

# Каталог сборки сервиса из docker-compose.yml (строка «build: ./services/…»)
build_dir() {
  awk -v s="  $1:" '$0 == s {f = 1; next} f && /^  [a-z0-9-]+:$/ {exit} f && $1 == "build:" {print $2; exit}' docker-compose.yml
}

# Копируем только каталоги выкатываемых сервисов: остальной код на сервере
# может отличаться от репозитория, и чужие правки трогать нельзя.
DIRS=()
for s in $SERVICES; do
  d=$(build_dir "$s")
  d=${d#./}
  [[ $d =~ ^services/[a-z0-9-]+$ ]] || { echo "::error::Не нашёл каталог сборки для $s"; exit 1; }
  [[ " ${DIRS[*]} " == *" $d "* ]] || DIRS+=("$d")
done

# Без --delete: файлы, которые есть только на сервере, не трогаем
SYNC=(-rlc --exclude=node_modules/ --exclude=__pycache__/ --exclude='*.pyc' --exclude=.venv/ --exclude=venv/
      --exclude=.pytest_cache/ --exclude=.env)
# Старые чанки фронтенда оставляем: открытые вкладки ещё могут их запросить
DIST=(-rlc)

case $MODE in
  check)
    remote check
    for d in "${DIRS[@]}"; do
      echo "== Скопируется в $d"
      rsync "${SYNC[@]}" -n -i "$d/" prod:"$APP_DIR/$d/" | grep -v '^\.' || true
    done
    echo "== Скопируется файлов фронтенда: $(rsync "${DIST[@]}" -n -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/" | grep -vc '^\.' || true)"
    echo "== Отличается от репозитория в других сервисах (не копируется)"
    others=(--exclude=/frontend/)
    for d in "${DIRS[@]}"; do others+=("--exclude=/${d#services/}/"); done
    rsync "${SYNC[@]}" "${others[@]}" -n -i services/ prod:"$APP_DIR/services/" | grep -v '^\.' | head -100 || true
    for f in docker-compose.yml nginx/nginx.conf; do
      echo "== Отличия $f (сервер → репозиторий, не копируется)"
      ssh prod cat "$APP_DIR/$f" 2>/dev/null | diff -u - "$f" | head -120 || true
    done
    ;;
  deploy)
    remote backup
    for d in "${DIRS[@]}"; do
      rsync "${SYNC[@]}" -i "$d/" prod:"$APP_DIR/$d/"
    done
    remote apply
    rsync "${DIST[@]}" -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/"
    remote verify
    ;;
  *)
    echo "::error::Неизвестный режим: $MODE"
    exit 1
    ;;
esac
