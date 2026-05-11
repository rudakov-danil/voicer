#!/bin/bash
# Локальный запуск VoiceIQ
#
# Использование:
#   ./start.sh                       — обычный быстрый старт
#   ./start.sh --rebuild             — с пересборкой Docker-образов (после правки бэка)
#   ./start.sh --seed                — досыпать демо-данные (магазины, продавцы, скрипт)
#   ./start.sh --rebuild --seed      — оба флага одновременно

set -e
cd "$(dirname "$0")"

REBUILD=false
SEED=false
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    --seed)    SEED=true ;;
    *) echo "ERROR: неизвестный флаг: $arg"; exit 1 ;;
  esac
done

if [ ! -f .env ]; then
  echo "ERROR: нет файла .env. Сделай 'cp .env.example .env' и заполни секреты."
  exit 1
fi

if $REBUILD; then
  echo "==> Пересборка Docker-образов"
  docker compose build
fi

echo "==> 1/5 Сборка фронтенда"
pushd services/frontend > /dev/null
[ ! -d node_modules ] && npm install --silent --no-audit --no-fund
npm run build
popd > /dev/null

echo "==> 2/5 Запуск инфраструктуры (postgres, redis, rabbitmq, minio)"
docker compose up -d postgres redis rabbitmq minio
echo "    ожидание 10s до готовности БД..."
sleep 10

echo "==> 3/5 Миграции БД"
for s in auth-service admin-service recorder-service transcription-service analytics-engine scripts-service; do
  printf "    -> %-22s " "$s"
  if docker compose run --rm "$s" alembic upgrade head > /tmp/voicer-migrate.log 2>&1; then
    echo "ok"
  else
    echo "FAIL"
    cat /tmp/voicer-migrate.log
    exit 1
  fi
done

echo "==> 4/5 Bootstrap суперадмина"
docker compose run --rm auth-service python bootstrap_admin.py 2>&1 | grep -E "\[bootstrap\]" || true

if $SEED; then
  echo "==> Seed демо-данных"
  docker compose exec -T postgres psql -U voiceiq -d voiceiq -v ON_ERROR_STOP=1 < seed_demo.sql 2>&1 | grep -E "NOTICE|ERROR" || true
fi

echo "==> 5/5 Запуск всех сервисов"
docker compose up -d
# Принудительно рестартим nginx, чтобы он перерезолвил IP пересозданных upstream-сервисов
docker compose restart nginx > /dev/null

echo ""
echo "Готово."
echo "  UI:           http://localhost"
echo "  RabbitMQ:     http://localhost:15672"
echo "  MinIO:        http://localhost:9001"
echo "  Grafana:      http://localhost:3001"
echo ""
echo "  Стоп:         docker compose down"
echo "  Логи:         docker compose logs -f --tail=50"
echo "  Логи воркера: docker compose logs -f transcription-worker"
