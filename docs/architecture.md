# Архитектура VoiceIQ

Проверено по коду и `docker ps` на сервере 2026-10-17 (образы — после пересборок 15:36 и 16:05 UTC). Пути даны от `~/voiceiq`.

## Принципы (замысел и как есть)
- Микросервисы на Python + FastAPI, каждый в своём контейнере; тяжёлая работа (распознавание, роли, анализ) идёт в фоне через RabbitMQ, HTTP-запрос не ждёт её окончания.
- Фронтенд ходит только через compose-nginx (`/api/v1/<svc>/`), сервисы между собой — по REST (JWT пользователя или `X-Internal-Key`).
- По замыслу каждый сервис работает только со своей схемой БД. На деле нет: recorder пишет в `transcription.*`, analytics читает и пишет `recorder.recordings`, dashboard читает все схемы, консоль техадмина в auth пишет в `admin_schema` (см. «Межсервисные HTTP-вызовы»).
- Мультитенантность — колонка `organization_id` и фильтр в коде каждой ручки (без Row-Level Security, один пользователь БД; `known-issues.md` №36–41).
- Не сделано из исходного плана: Dead Letter Queue, Redis-blacklist токенов, Traefik, Kubernetes, мониторинг Grafana, локальные Whisper/LLM на GPU — бэклог в `known-issues.md`.
- Снаружи открыты только порты 22, 80, 443. Отдельного мониторинга нет: состояние сервисов и зависшие записи показывает консоль техадмина (`super-admin.md`).

## Контейнеры и образы
| Контейнер | build / image | command | Порт | Образ собран (UTC) |
|---|---|---|---|---|
| auth-service | services/auth-service | uvicorn app.main:app | 8001 | 2026-10-17 15:36 |
| admin-service | services/admin-service | uvicorn | 8007 (в base compose проброшен, override убирает) | 2026-10-08 |
| recorder-service | services/recorder-service | uvicorn | 8002 | 2026-10-17 16:05 |
| recorder-worker | services/recorder-service | `python -m worker.stitch_worker` | — | 2026-10-17 16:05 |
| transcription-service | services/transcription-service | uvicorn | 8003 | 2026-10-17 16:05 |
| transcription-worker | services/transcription-service | `python -m worker.transcribe_worker` | — | 2026-10-17 16:05 |
| diarize-worker | services/transcription-service | `python -m worker.diarize_worker` | — | 2026-10-17 16:05 |
| analytics-engine | services/analytics-engine | uvicorn | 8004 | 2026-10-17 16:05 |
| analytics-worker | services/analytics-engine | `python -m worker.analyze_worker` | — | 2026-10-17 16:05 |
| scripts-service | services/scripts-service | uvicorn | 8005 | 2026-10-14 |
| dashboard-service | services/dashboard-service | uvicorn | 8006 | 2026-10-17 16:05 |
| dashboard-worker | services/dashboard-service | `python -m worker.cache_invalidation_worker` | — | 2026-10-17 16:05 |
| nginx | nginx:1.25-alpine | — | 80 → 127.0.0.1:8080 | — |
| postgres | postgres:16 | — | 5432 (закрыт override) | — |
| redis | redis:7-alpine | — | 6379 | — |
| rabbitmq | rabbitmq:3.13-management-alpine | — | 5672, 15672 | — |
| minio | minio/minio:latest | — | 9000, 9001 | — |
| prometheus, node-exporter, grafana | описаны в compose | — | 9090, 3001 | **не запущены** |

Порты всех сервисов задаются в CMD их Dockerfile. Python 3.12-slim, у recorder и transcription есть ffmpeg; у transcription в образе лежат torch-cpu, speechbrain и модель ECAPA (`/opt/ecapa`, `HF_HUB_OFFLINE=1`).

Версии образов (2026-10-17 16:05 UTC): все четыре группы (recorder, transcription, analytics, dashboard) пересобраны вместе, дрейфа между API и воркерами нет. При следующей правке общего кода по-прежнему пересобирать группой. Встроенные слушатели очередей в API-сервисах запускаются через `_consume_forever` (`app/main.py` четырёх сервисов): если RabbitMQ недоступен, пишут `<очередь> consumer failed, retrying in 5 s` и повторяют подключение — после перезагрузки сервера они поднимаются сами.

## Процессы-потребители очередей
| Очередь | Кто публикует | Кто слушает (consumers=2 значит API и воркер) |
|---|---|---|
| queue.stitch | recorder `/chunks/finalize` (services/recorder-service/app/routers/chunks.py:92) | recorder-service (app/main.py:23) **и** recorder-worker |
| queue.transcribe_full | stitch_worker (worker/stitch_worker.py:97) | transcription-service (app/main.py:23) **и** transcription-worker |
| queue.diarize | recorder upload/telephony, transcribe_worker | только diarize-worker (app/main.py:19-20 transcription-service нарочно не слушает) |
| queue.analyze | diarize_worker, telephony stereo, upload-transcript, reanalyze | analytics-engine (app/main.py:14-21) **и** analytics-worker |
| queue.cache.invalidate | analyze_worker | dashboard-service (app/main.py:11-19) **и** dashboard-worker |
Мобильная очередь — не RabbitMQ, а строки `recorder.recordings` со статусом `mobile_queued`; их опрашивает цикл в recorder-service (services/recorder-service/app/routers/mobile.py:135, раз в 5 с, advisory lock на запись).

Все очереди durable, без dead-letter. `nack(requeue=False)` в transcribe/diarize-воркерах означает, что сообщение потеряно. analyze_worker работает с `message.process(requeue=True)` (worker/analyze_worker.py:823): исключение возвращает сообщение в очередь бесконечно.

Состояние очередей на 2026-10-17 16:08 UTC (после проверки с остановленным RabbitMQ): все пусты; consumers: stitch 2, transcribe_full 2, analyze 2, cache.invalidate 2, diarize 1. Если после перезагрузки у какой-то очереди 1 вместо 2 — смотреть логи API-сервиса по `consumer failed`.

## MinIO
| Бакет | Что | Путь объекта |
|---|---|---|
| voiceiq-recordings | аудио каждого разговора | `{org}/{store}/{seller}/{date}/{recording_id}{ext}`; части разбиения — `{part_id}-part{n}{ext}` |
| voiceiq-audio-chunks | куски бейджа | `{org}/{device}/{date}/{index:06d}_{chunk_id}.wav` |
| voiceiq-audio-full | склеенный день бейджа | `{org}/{device}/{date}/full_day.wav`, удаляется после нарезки |
`recordings.audio_path` = `бакет/объект`. У готовых текстов `transcript-only/{id}` (файла нет), у отсеянных кофейных записей `''`. Браузер получает аудио через `/api/v1/recorder/recordings/{id}/audio/stream`, а не presigned URL (у того хост `minio:9000`).

## Redis
Только dashboard-service: ключи `dashboard:*:{org}:{store}:*`, TTL по умолчанию 300 с (services/dashboard-service/app/redis_client.py). Сбрасываются по queue.cache.invalidate.

## Межсервисные HTTP-вызовы
| Откуда | Куда | Авторизация |
|---|---|---|
| все сервисы с JWT | auth `/api/v1/auth/verify` (кабинет) или `/api/v1/auth/mobile/verify` (приложение) | Bearer пользователя |
| recorder `/chunks*` | admin `/api/v1/admin/devices/by-serial/{serial}` | без авторизации |
| recorder conversation_split | transcription `/api/v1/transcription/internal/segment-conversations` | X-Internal-Key |
| transcribe_worker, upload-transcript | recorder `/api/v1/recorder/recordings/internal` | **без авторизации** |
| diarize_worker | recorder `PATCH /recordings/{id}/status` (без авторизации), admin `/admin/sellers/{id}` (X-Internal-Key) | |
| analyze_worker | transcription `/transcripts/{recording_id}`, scripts `/scripts/*`, recorder `/recordings/{id}/discard-context` | X-Internal-Key |
Часть сервисов читает чужие схемы напрямую через общий `DATABASE_URL` (один пользователь `voiceiq`): recorder пишет `transcription.*`, analytics читает и пишет `recorder.recordings`, auth читает `admin_schema.sellers`, dashboard читает всё.

## Переменные окружения (значения не приводятся)
Источник — `.env` (права 600) через `${VAR}` в docker-compose.yml. Общие для всех Python-сервисов: `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM=HS256`, `INTERNAL_SERVICE_KEY`, `ENVIRONMENT=development`, `LOG_LEVEL=INFO`.

| Группа | Переменные | Сервисы |
|---|---|---|
| инфраструктура | POSTGRES_PASSWORD, RABBITMQ_PASSWORD, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, `MINIO_BUCKET=voiceiq-recordings`, REDIS_URL | по назначению |
| auth | ACCESS_TOKEN_EXPIRE_MINUTES=15, REFRESH_TOKEN_EXPIRE_DAYS=30, BOOTSTRAP_ADMIN_EMAIL/PASSWORD, BOOTSTRAP_ORG_NAME/SLUG; DOMAIN_ORGS и DOMAIN_ORG_GUESTS **не** передаются в compose — работают значения по умолчанию из services/auth-service/app/config.py:17-19 | auth |
| admin | ADMIN_PANEL_PASSWORD | admin |
| STT | DEEPGRAM_API_KEY, DEEPGRAM_API_URL, DEEPGRAM_LANGUAGE (в .env `auto-ru-kk`), DEEPGRAM_MODEL (`nova-3`), DEEPGRAM_RU_DETECT_MIN, STT_PROVIDER (`openrouter`), STT_MODEL (`elevenlabs/scribe-v2`), STT_LANGUAGE (`kk`) | recorder-service, transcription-service, transcription-worker (не recorder-worker, не diarize-worker) |
| LLM | LLM_SERVER_URL (OpenRouter), LLM_API_KEY, LLM_FOLDER_ID, LLM_EXTRA_HEADER_NAME/VALUE, LLM_MODEL_NAME (`deepseek/deepseek-v4.1-flash`) | transcription*, diarize, analytics*, scripts; recorder получает только URL и ключ (для OpenRouter STT) |
| анализ | LLM_CHEAP_MODEL, LLM_MERGE_ANALYSIS, LLM_SCRIPT_TIMEOUT (60), LLM_GENERAL_TIMEOUT (60) | analytics-worker (timeouts только ему) |
| в .env, но не доходят до контейнеров | LLM_MAX_PARALLEL_SCRIPTS, LLM_MAX_TOKENS, WHISPER_SERVER_URL; часть ключей в .env продублирована | — |
| только из кода (дефолт в app/config.py) | SPEAKER_CONFIDENCE_MIN=0.85, SPLIT_MANUAL_UPLOADS=True, LLM_DISABLE_THINKING=True, OFFERS_ANALYSIS_ENABLED, COFFEE_CONTEXT_FILTER_ENABLED, CONTEXT_FILTER_TIMEOUT, RECORDER_SERVICE_URL, TRANSCRIPTION_SERVICE_URL | |

Проверить, что дошло до контейнера (без секретов):
```bash
docker exec voiceiq-recorder-service-1 sh -c 'echo $STT_PROVIDER $STT_LANGUAGE $DEEPGRAM_LANGUAGE'
```

## Прочие файлы в ~/voiceiq
| Файл | Что это |
|---|---|
| deploy.sh | старый деплой через `git pull` — на этом сервере не работает, не запускать |
| start.sh | локальный запуск с `npm run build` — не запускать (затрёт dist) |
| reset_password.sh | смена пароля пользователя кабинета через getpass (запускает пользователь) |
| seed_demo.sql, fix_org.sql, demo-data/ | демо-данные и разовые правки прошлых сессий |
| deploy/mobile/nginx.conf | копия конфига mobile-домена без certbot-части |
| docs/ | вся документация проекта (оглавление — docs/README.md), памятка — CLAUDE.md |
| whisper-gpu/, whisper-server/ | наследие локального Whisper, не используется |
| ~/releases/, ~/horeca-fix-20261017/, ~/horeca-context-20261017/ | подготовленные релизы (копии файлов, регрессионные тесты), уже выкаченные в ~/voiceiq; `~/releases/git-sync-20261014/` — экспорт кода без dist и секретов (source.tgz + манифесты) |
| ~/deploy-backups/ | бэкапы релизов 08–17.10, сделанные не в сессиях Claude: `code-20261013`, `pharmacy-20261014-*`, `motivation-20261014`, `coffee-shop-demo-20261014`, `no-prices-20261014`, `semantic-split-20261015`, `horeca-fix-20261017`, `horeca-context-20261017`, `horeca-favicon-20261017` (архивы кода и `frontend-dist-*`), дампы БД `voiceiq-20261008-*.dump` … `voiceiq-20261013-120251.dump` |
