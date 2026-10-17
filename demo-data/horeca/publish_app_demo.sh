#!/usr/bin/env bash
set -euo pipefail
release=/home/voicer/releases/coffee-shop-demo-20261014
project=/home/voicer/voiceiq
cd "$release"
sudo docker run --rm --network voiceiq_default --env-file analytics.env -e PYTHONPATH=/app -v "$PWD/check_demo_tips.py:/checks/check_demo_tips.py:ro" voicer-coffee-demo-analytics python /checks/check_demo_tips.py
for name in dashboard-service analytics-engine; do
  image=$(sudo docker inspect "voiceiq-$name-1" --format '{{.Image}}')
  sudo docker tag "$image" "voiceiq-$name:coffee-demo-rollback-20261014"
done
cp services/dashboard-service/app/routers/{upsell.py,coins.py} "$project/services/dashboard-service/app/routers/"
cp services/analytics-engine/app/routers/coach.py "$project/services/analytics-engine/app/routers/"
sudo docker tag voicer-coffee-demo-dashboard voiceiq-dashboard-service:latest
sudo docker tag voicer-coffee-demo-analytics voiceiq-analytics-engine:latest
cd "$project"
sudo docker compose up -d --no-build --no-deps --force-recreate dashboard-service analytics-engine
sudo docker restart voiceiq-nginx-1
sudo docker cp "$release/demo-data/horeca/seed_app_motivation.py" voiceiq-dashboard-service-1:/tmp/seed_app_motivation.py
sudo docker exec voiceiq-dashboard-service-1 python /tmp/seed_app_motivation.py --day 2026-10-14 --apply
sudo docker exec voiceiq-dashboard-service-1 python -c '
import asyncio
import redis.asyncio as redis
from app.config import settings
async def clear():
    client=redis.from_url(settings.REDIS_URL)
    keys=[key async for key in client.scan_iter(match="*c9842e2d-9d12-51ad-8880-08cb67489cac*")]
    if keys: await client.delete(*keys)
    print("Demo cache keys cleared:",len(keys))
    await client.aclose()
asyncio.run(clear())'
sudo mkdir -p /var/www/voicer-mobile/releases/20261014-demo
sudo cp "$release"/services/mobile/{app.js,api.js,shift.js,coins.js,storage.js,styles.css,onest-cyrillic.woff2,onest-cyrillic-ext.woff2,onest-latin.woff2} /var/www/voicer-mobile/releases/20261014-demo/
sudo cp "$release"/services/mobile/{index.html,app.html,sw.js} /var/www/voicer-mobile/
cp -a "$release/services/frontend/dist/assets/." "$project/services/frontend/dist/assets/"
cp "$release/services/frontend/dist/index.html" "$project/services/frontend/dist/index.html"
cp "$release"/services/frontend/src/pages/MotivationPage.{tsx,js} "$project/services/frontend/src/pages/"
cp "$release"/services/frontend/src/api/upsells.{ts,js} "$project/services/frontend/src/api/"
mkdir -p "$project/demo-data/horeca"
cp "$release/demo-data/horeca/"* "$project/demo-data/horeca/"
cp -a "$release/services/mobile/." "$project/services/mobile/"
echo 'Coffee Shop app demo published'
