#!/bin/bash
# VoiceIQ deploy script
# Usage: ./deploy.sh [--full-rebuild]

set -e

COMPOSE="docker compose"
WORKERS="diarize-worker transcription-worker analytics-worker recorder-worker dashboard-worker"
SERVICES="auth-service admin-service recorder-service transcription-service analytics-engine scripts-service dashboard-service nginx"

echo "==> Pulling latest code..."
git pull origin master

echo "==> Building changed images..."
if [ "$1" = "--full-rebuild" ]; then
  $COMPOSE build --no-cache
else
  $COMPOSE build
fi

echo "==> Running database migrations..."
for service in auth-service admin-service recorder-service transcription-service analytics-engine scripts-service; do
  echo "  -> $service"
  $COMPOSE run --rm $service alembic upgrade head
done

echo "==> Restarting services..."
$COMPOSE up -d $SERVICES $WORKERS

echo "==> Waiting for services to start..."
sleep 5

echo "==> Status:"
$COMPOSE ps

echo ""
echo "Done! Logs: docker compose logs -f --tail=50"
