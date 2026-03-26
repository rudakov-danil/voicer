# Инфраструктура и деплой

## Dev-сервер (текущее состояние)

| Параметр | Значение |
|----------|---------|
| IP | 192.168.10.69 |
| Пользователь | dmitry |
| ОС | Ubuntu 22.04 LTS |
| CPU | Intel Core i5-4210U @ 1.70GHz (4 потока) |
| RAM | 5.7 GB |
| Подключение | SSH по ключу (без пароля) |
| Docker | Engine 29.3.0 + Compose v5.1.1 |

**Подключение:**
```bash
ssh dmitry@192.168.10.69
```

Или через алиас — добавь в `C:\Users\Dmitry\.ssh\config` на компе:
```
Host devserver
    HostName 192.168.10.69
    User dmitry
```
Тогда просто: `ssh devserver`

> Ключ компа уже добавлен в `~/.ssh/authorized_keys` на ноуте.
> Комп и ноут должны быть в сети `192.168.10.x`. VPN на компе должен быть отключён или настроен с раздельным туннелированием для подсети `192.168.10.0/24`.

---

## Окружения

| Окружение | Описание | Оркестрация |
|-----------|---------|-------------|
| **Разработка (dev)** | Ноутбук 192.168.10.69 | Docker Compose |
| **MVP (staging/prod)** | Первый пилот на реальных данных | Docker Compose |
| **Продакшен (scale)** | При росте нагрузки | Kubernetes (Yandex Cloud) |

---

## Запуск и остановка стека

```bash
ssh dmitry@192.168.10.69
cd /home/dmitry/voiceiq

# Запустить всё
docker compose up -d

# Остановить всё
docker compose down

# Посмотреть статус
docker compose ps

# Логи конкретного сервиса
docker logs voiceiq-auth-service-1 -f
```

---

## Docker Compose — полный состав (16 контейнеров)

Файл: `/home/dmitry/voiceiq/docker-compose.yml`

### Инфраструктурные сервисы

| Контейнер | Образ | Порт | Healthcheck |
|-----------|-------|------|-------------|
| `voiceiq-postgres-1` | postgres:16 | 5432 | ✅ |
| `voiceiq-redis-1` | redis:7 | 6379 | ✅ |
| `voiceiq-rabbitmq-1` | rabbitmq:3.13-management | 5672, 15672 | ✅ |
| `voiceiq-minio-1` | minio/minio | 9000, 9001 | ✅ |

### API сервисы

| Контейнер | Порт | Описание |
|-----------|------|---------|
| `voiceiq-auth-service-1` | 8001 | Аутентификация, JWT, организации |
| `voiceiq-recorder-service-1` | 8002 | Приём аудио-чанков с бейджей |
| `voiceiq-transcription-service-1` | 8003 | API для транскриптов |
| `voiceiq-analytics-engine-1` | 8004 | API для аналитики разговоров |
| `voiceiq-scripts-service-1` | 8005 | Управление скриптами продаж |
| `voiceiq-dashboard-service-1` | 8006 | Агрегированная аналитика, дашборд |
| `voiceiq-admin-service-1` | 8007 | Магазины, продавцы, устройства |

### Воркеры (RabbitMQ consumers, HTTP-порта нет)

| Контейнер | Очередь | Описание |
|-----------|---------|---------|
| `voiceiq-recorder-worker-1` | `queue.stitch` | Склеивает чанки в full_day.wav |
| `voiceiq-transcription-worker-1` | `queue.transcribe_full` | Whisper + нарезка разговоров |
| `voiceiq-diarize-worker-1` | `queue.diarize` | Диаризация через LLM |
| `voiceiq-analytics-worker-1` | `queue.analyze` | LLM-анализ и скоринг |
| `voiceiq-dashboard-worker-1` | `queue.cache.invalidate` | Инвалидация кеша Redis |

---

## AI сервисы на хосте (systemd)

Запущены напрямую на хосте, **вне Docker**. Docker-контейнеры обращаются к ним по IP хоста.

### Whisper STT сервер

| Параметр | Значение |
|----------|---------|
| Путь | `/home/dmitry/whisper-server/` |
| Сервис | `whisper-server.service` (systemd) |
| Порт | 8080 |
| Модель | `faster-whisper-small` |
| API | `POST /transcribe` (multipart: file, language, task) |

```bash
# Статус
sudo systemctl status whisper-server

# Логи
sudo journalctl -u whisper-server -f

# Рестарт
sudo systemctl restart whisper-server

# Тест
curl http://localhost:8080/health
```

### Ollama (LLM)

| Параметр | Значение |
|----------|---------|
| Сервис | `ollama.service` (systemd) |
| Порт | 11434 |
| Модель | `qwen2.5:3b` (1.9 GB) |
| API | OpenAI-совместимый (`/v1/chat/completions`) |

```bash
# Статус
sudo systemctl status ollama

# Список моделей
ollama list

# Тест
curl http://localhost:11434/api/tags
```

> **Ограничение:** Из-за слабого железа (i5-4210U, 5.7 GB RAM, нет подходящего GPU) используется `qwen2.5:3b` вместо `qwen2.5:14b` из спецификации. Скорость ~1-3 токена/сек на CPU. Для продакшена — нужен нормальный сервер.

---

## Переменные окружения

Файл: `/home/dmitry/voiceiq/.env` (и `E:/voiceIQ/.env` на рабочей машине)

```bash
# База данных
POSTGRES_PASSWORD=voiceiq_dev_password

# RabbitMQ
RABBITMQ_PASSWORD=voiceiq_dev_password

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# JWT
JWT_SECRET=voiceiq-dev-secret-key-minimum-32-characters-long

# AI сервисы (запущены на хосте, не в Docker)
WHISPER_SERVER_URL=http://192.168.10.69:8080
LLM_SERVER_URL=http://192.168.10.69:11434
LLM_MODEL_NAME=qwen2.5:3b
```

> `.env` не коммитится в репозиторий.

---

## База данных

**СУБД:** PostgreSQL 16, пользователь `voiceiq`, база `voiceiq`

Миграции запускаются вручную (`alembic upgrade head`) внутри каждого сервис-контейнера. В текущей конфигурации **не запускаются автоматически** при старте контейнера.

### Схемы и таблицы

| Схема | Таблицы |
|-------|---------|
| `auth` | organizations, users, refresh_tokens, super_admins, rop_store_assignments |
| `recorder` | recordings, audio_chunks |
| `transcription` | transcripts, transcript_segments |
| `analytics` | conversations, conversation_scores, conversation_script_results, objections |
| `scripts` | script_templates, script_steps, seller_script_assignments |
| `admin_schema` | stores, sellers, devices, alert_settings, privacy_settings, store_licenses |

```bash
# Проверить таблицы
docker exec voiceiq-postgres-1 psql -U voiceiq -c \
  "SELECT schemaname, tablename FROM pg_tables
   WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
   ORDER BY schemaname, tablename;"
```

### Повторный запуск миграций (если нужно)

```bash
cd /home/dmitry/voiceiq
docker exec voiceiq-auth-service-1 alembic upgrade head
docker exec voiceiq-recorder-service-1 alembic upgrade head
docker exec voiceiq-transcription-service-1 alembic upgrade head
# analytics, scripts — требуют патча alembic.ini (см. раздел "Известные проблемы")
```

---

## MinIO — бакеты

| Бакет | Назначение |
|-------|-----------|
| `voiceiq-audio-chunks` | Чанки аудио с бейджей (временные) |
| `voiceiq-audio-full` | Склеенные full_day.wav (временные) |
| `voiceiq-recordings` | Нарезанные записи разговоров (постоянные) |

MinIO Console: `http://192.168.10.69:9001` (login: `minioadmin` / `minioadmin123`)

---

## Тестовые данные (dev)

| Роль | Email | Пароль |
|------|-------|--------|
| SuperAdmin | `superadmin@voiceiq.dev` | `admin123` |
| Директор | `director@test-retail.ru` | `Director123` |
| Менеджер | `manager@test-retail.ru` | `Manager123` |

- Организация: "Тестовая Сеть Магазинов" (slug: `test-retail`)
- Магазин: "Магазин №1 — ТЦ Центральный", ул. Ленина, 10
- Продавец: Алексей Продавцов
- Устройство: `BADGE-001` (привязан к Алексею Продавцову)

---

## Известные проблемы и особенности

### 1. bcrypt 5.x несовместим с passlib 1.7.4
**Сервис:** auth-service
**Симптом:** `ValueError: password cannot be longer than 72 bytes` при логине
**Решение:** В `requirements.txt` auth-service добавлена строка `bcrypt==4.0.1`

### 2. alembic.ini — захардкоженный localhost
**Сервисы:** analytics-engine, scripts-service (и некоторые другие)
**Симптом:** `OSError: Connect call failed ('127.0.0.1', 5432)` при запуске миграций
**Решение:** Перед `alembic upgrade head` внутри контейнера выполнить:
```bash
docker exec voiceiq-analytics-engine-1 bash -c \
  "sed -i 's|sqlalchemy.url.*|sqlalchemy.url = postgresql+asyncpg://voiceiq:voiceiq_dev_password@postgres:5432/voiceiq|' alembic.ini"
```

### 3. alembic_version — общая таблица для всех сервисов
**Симптом:** Миграции сервисов не применяются (считают что уже на head)
**Причина:** Все сервисы по умолчанию пишут в `public.alembic_version`
**Решение:** В `alembic/env.py` каждого сервиса добавлено `version_table_schema="<schema_name>"` в `context.configure()`

### 4. Воркеры используют declare_queue (не get_queue)
Все воркеры используют `channel.declare_queue(..., durable=True)` — это объявляет очередь если её нет. Не менять на `get_queue()` — он упадёт если очередь не существует при старте.

### 5. Таймаут Whisper увеличен до 1800 сек
**Файл:** `services/transcription-service/app/whisper_client.py`
**Причина:** i5-4210U транскрибирует 19-минутный файл ~10-20 минут. Дефолтный таймаут 300 сек вызывал `httpx.ReadTimeout`.

### 6. Тестирование пайплайна вручную

Чтобы прогнать файл через весь пайплайн:
```bash
# 1. Залить WAV как чанк
curl -X POST http://192.168.10.69:8002/api/v1/recorder/chunks \
  -F 'file=@/path/to/audio.wav;type=audio/wav' \
  -F 'device_id=BADGE-001' \
  -F 'chunk_index=0' \
  -F 'session_date=2026-03-22' \
  -F 'timestamp_start=2026-03-22T10:00:00Z' \
  -F 'timestamp_end=2026-03-22T11:00:00Z'

# 2. Финализировать сессию (запускает склейку)
curl -X POST http://192.168.10.69:8002/api/v1/recorder/chunks/finalize \
  -F 'device_id=BADGE-001' \
  -F 'session_date=2026-03-22' \
  -F 'total_chunks=1'

# 3. Следить за очередями
curl -s -u voiceiq:voiceiq_dev_password http://192.168.10.69:15672/api/queues/%2F | python3 -c "
import sys,json
for q in json.load(sys.stdin):
    print(q['name'], 'ready='+str(q['messages_ready']), 'unacked='+str(q['messages_unacknowledged']))"

# 4. Проверить транскрипты
docker exec voiceiq-postgres-1 psql -U voiceiq \
  -c "SELECT id, status FROM transcription.transcripts ORDER BY created_at DESC LIMIT 5;"
```

**Ожидаемое время обработки** (на i5-4210U):
- Whisper (small): ~1 мин на каждые 1-2 мин аудио
- LLM сегментация (qwen2.5:3b): ~2-5 мин
- LLM аналитика: ~2-5 мин на разговор

---

## Структура репозитория (фактическая)

```
voiceiq/
├── docker-compose.yml          — полный стек (16 контейнеров)
├── .env                        — переменные окружения (не в git)
├── whisper-server/             — Whisper STT сервер (на хосте)
│   └── server.py               — FastAPI + faster-whisper
├── services/
│   ├── auth-service/
│   ├── recorder-service/
│   ├── transcription-service/
│   ├── analytics-engine/
│   ├── scripts-service/
│   ├── dashboard-service/
│   └── admin-service/
└── documentation/
```

---

## Продакшен-инфраструктура (после MVP)

При переходе на Kubernetes и Yandex Cloud:
- **Яндекс Managed PostgreSQL** — managed БД с автоматическими бэкапами
- **Яндекс Object Storage** — замена MinIO (S3-совместимый)
- **Яндекс Managed Redis** — managed Redis
- **Яндекс Message Queue** — управляемый RabbitMQ / Kafka
- **Yandex Container Registry** — хранилище Docker-образов
- **Horizontal Pod Autoscaler** — автоматическое масштабирование воркеров под нагрузку
- **Нормальный GPU-сервер** — для Whisper large-v3 и qwen2.5:14b
