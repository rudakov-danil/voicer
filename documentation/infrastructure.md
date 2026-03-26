# Инфраструктура и деплой

## Dev-сервер (текущее состояние)

| Параметр | Значение |
|----------|---------|
| IP | 192.168.10.69 |
| Пользователь | dmitry |
| ОС | Ubuntu 22.04 LTS |
| CPU | Intel Core i5-4210U @ 1.70GHz (4 потока) |
| RAM | 5.7 GB |
| Docker | Engine 29.3.0 + Compose v5.1.1 |

**Подключение:**
```bash
ssh dmitry@192.168.10.69
```

---

## Веб-интерфейсы (dev)

| Интерфейс                    | Адрес                           | Логин        | Пароль                 |
| ---------------------------- | ------------------------------- | ------------ | ---------------------- |
| Панель управления (sqladmin) | http://192.168.10.69:8007/admin | —            | `voiceiq_admin`        |
| Grafana (мониторинг)         | http://192.168.10.69:3001       | `admin`      | `voiceiq_admin`        |
| RabbitMQ Management          | http://192.168.10.69:15672      | `voiceiq`    | `voiceiq_dev_password` |
| MinIO Console                | http://192.168.10.69:9001       | `minioadmin` | `minioadmin123`        |

---

## Деплой

Репозиторий: `https://github.com/Freezy113/voiceiq` (приватный)

### Первый деплой на новый сервер

```bash
git clone https://github.com/Freezy113/voiceiq.git
cd voiceiq
cp .env.example .env
nano .env                          # заполнить пароли и ключи
docker compose up -d postgres redis rabbitmq minio
sleep 10
chmod +x deploy.sh && ./deploy.sh --full-rebuild
```

### Обновление (каждый раз)

```bash
cd /home/dmitry/voiceiq
./deploy.sh
```

Скрипт: `git pull` → `docker build` → `alembic upgrade head` (все сервисы) → `docker compose up -d`

---

## Окружения

| Окружение | Описание | Оркестрация |
|-----------|---------|-------------|
| **Разработка (dev)** | Ноутбук 192.168.10.69 | Docker Compose |
| **MVP (staging/prod)** | Первый пилот на реальных данных | Docker Compose |
| **Продакшен (scale)** | При росте нагрузки | Kubernetes (Yandex Cloud) |

---

## Docker Compose — полный состав (21 контейнер)

Файл: `docker-compose.yml`

### Инфраструктурные сервисы

| Контейнер | Образ | Порт | Описание |
|-----------|-------|------|---------|
| `postgres` | postgres:16 | 5432 | Основная БД |
| `redis` | redis:7 | 6379 | Кеш дашборда |
| `rabbitmq` | rabbitmq:3.13-management | 5672, 15672, 15692 | Очереди задач |
| `minio` | minio/minio | 9000, 9001 | Хранилище аудио |
| `nginx` | nginx:alpine | 80 | API Gateway / reverse proxy |

### API сервисы

| Контейнер | Порт | Описание |
|-----------|------|---------|
| `auth-service` | 8001 | Аутентификация, JWT, организации |
| `recorder-service` | 8002 | Приём аудио-чанков с бейджей |
| `transcription-service` | 8003 | API транскриптов и сегментов |
| `analytics-engine` | 8004 | API аналитики разговоров |
| `scripts-service` | 8005 | Управление скриптами продаж |
| `dashboard-service` | 8006 | Агрегированная аналитика |
| `admin-service` | 8007 | Магазины, продавцы, устройства + sqladmin |

### Воркеры

| Контейнер | Очередь | Описание |
|-----------|---------|---------|
| `recorder-worker` | `queue.stitch` | Склеивает чанки в full_day.wav |
| `transcription-worker` | `queue.transcribe_full` | Whisper + нарезка разговоров |
| `diarize-worker` | `queue.diarize` | Диаризация (определение ролей) через LLM |
| `analytics-worker` | `queue.analyze` | LLM-анализ и скоринг |
| `dashboard-worker` | `queue.cache.invalidate` | Инвалидация кеша Redis |

### Мониторинг

| Контейнер | Порт | Описание |
|-----------|------|---------|
| `prometheus` | 9090 | Сбор метрик |
| `grafana` | 3001 | Дашборды мониторинга |
| `node-exporter` | — | Метрики хоста (CPU, RAM, диск) |

---

## Мониторинг (Grafana)

Дашборд **VoiceIQ — Система** (`http://192.168.10.69:3001`):

- **Статус контейнеров** — сколько запущено/остановлено (Docker native metrics, порт 9323)
- **CPU хоста** — общая загрузка процессора по времени (node-exporter)
- **RAM хоста** — использование памяти (node-exporter)
- **Очереди RabbitMQ** — глубина каждой очереди в реальном времени
- **HTTP запросы** — req/s к каждому сервису
- **Диск хоста** — использование файловой системы

> **Почему не cAdvisor:** cAdvisor несовместим с Docker 29 (новая система хранения overlayfs без layerdb). Используется node-exporter для метрик хоста + Docker native Prometheus endpoint (порт 9323, включается через `/etc/docker/daemon.json`).

---

## AI сервисы

### Whisper STT сервер (на хосте, вне Docker)

| Параметр | Значение |
|----------|---------|
| Путь | `/home/dmitry/whisper-server/` |
| Сервис | `whisper-server.service` (systemd) |
| Порт | 8080 |
| Модель | `faster-whisper-small` |

```bash
sudo systemctl status whisper-server
sudo systemctl restart whisper-server
curl http://localhost:8080/health
```

### LLM — 1BitAI Cloud API ⚠️ Временное решение

> **Временное решение** для dev-окружения. 1BitAI используется пока нет подходящего железа для запуска LLM локально. В продакшене планируется либо более мощный локальный сервер (GPU + qwen2.5:14b через Ollama), либо другой облачный провайдер с SLA.

| Параметр | Значение |
|----------|---------|
| Base URL | `https://llm.1bitai.ru` |
| Модель | `qwen2.5:14b` |
| Авторизация | заголовок `X-PROXY-AUTH: <ключ>` |
| Таймаут | 120 сек |

Используется в:
- `transcription-service` / `diarize-worker` — диаризация (определение ролей)
- `analytics-worker` — скоринг по скриптам и общий анализ разговора

---

## Переменные окружения

Файл: `.env` (не коммитится, шаблон: `.env.example`)

```bash
# ─── База данных ──────────────────────────
POSTGRES_PASSWORD=...

# ─── RabbitMQ ─────────────────────────────
RABBITMQ_PASSWORD=...

# ─── MinIO ────────────────────────────────
MINIO_ACCESS_KEY=voiceiq
MINIO_SECRET_KEY=...

# ─── JWT ──────────────────────────────────
JWT_SECRET=...              # минимум 32 символа

# ─── Service-to-service auth ──────────────
INTERNAL_SERVICE_KEY=...    # воркеры → API сервисы без JWT

# ─── Панель управления ────────────────────
ADMIN_PANEL_PASSWORD=...
GRAFANA_PASSWORD=...

# ─── Whisper ──────────────────────────────
WHISPER_SERVER_URL=http://192.168.10.69:8080

# ─── LLM (временно: 1BitAI cloud) ─────────
LLM_SERVER_URL=https://llm.1bitai.ru
LLM_API_KEY=1bitai
LLM_EXTRA_HEADER_NAME=X-PROXY-AUTH
LLM_EXTRA_HEADER_VALUE=<ключ 1BitAI>
LLM_MODEL_NAME=qwen2.5:14b
LLM_SCRIPT_TIMEOUT=120
LLM_GENERAL_TIMEOUT=120
```

---

## Service-to-service аутентификация

Воркеры обращаются к API сервисам без JWT — через заголовок `X-Internal-Key`.

```
analytics-worker  →  transcription-service  GET /transcripts/{id}/segments
diarize-worker    →  admin-service          GET /sellers/{id}
```

Все API сервисы поддерживают два варианта авторизации:
- **JWT Bearer** — для фронтенда и внешних клиентов
- **X-Internal-Key** — для воркеров внутри Docker-сети

---

## База данных

PostgreSQL 16, пользователь `voiceiq`, база `voiceiq`

| Схема | Ключевые таблицы |
|-------|---------|
| `auth` | organizations, users, refresh_tokens |
| `recorder` | recordings, audio_chunks |
| `transcription` | transcripts, transcript_segments |
| `analytics` | conversations, conversation_scores, objections |
| `scripts` | script_templates, script_steps |
| `admin_schema` | stores, sellers, devices, store_licenses |

Миграции запускаются через `deploy.sh` (`alembic upgrade head` для каждого сервиса).

---

## MinIO — бакеты

| Бакет | Назначение |
|-------|-----------|
| `voiceiq-audio-chunks` | Чанки аудио с бейджей (временные) |
| `voiceiq-audio-full` | Склеенные full_day.wav |
| `voiceiq-recordings` | Нарезанные записи разговоров |

---

## Тестовые данные (dev)

| Роль | Email | Пароль |
|------|-------|--------|
| SuperAdmin | `superadmin@voiceiq.dev` | `admin123` |
| Директор | `director@test-retail.ru` | `Director123` |
| Менеджер | `manager@test-retail.ru` | `Manager123` |

- Организация: "Тестовая Сеть Магазинов"
- Магазин: "Магазин №1 — ТЦ Центральный"
- Продавец: Алексей Продавцов
- Устройство: `BADGE-001`

---

## Тест пайплайна вручную

```bash
# 1. Отправить аудио-чанк
curl -X POST http://192.168.10.69:8002/api/v1/recorder/chunks \
  -F 'file=@audio.wav;type=audio/wav' \
  -F 'device_id=BADGE-001' \
  -F 'chunk_index=0' \
  -F 'session_date=2026-03-22' \
  -F 'timestamp_start=2026-03-22T10:00:00Z' \
  -F 'timestamp_end=2026-03-22T11:00:00Z'

# 2. Финализировать (запускает склейку → транскрипцию → анализ)
curl -X POST http://192.168.10.69:8002/api/v1/recorder/chunks/finalize \
  -F 'device_id=BADGE-001' \
  -F 'session_date=2026-03-22' \
  -F 'total_chunks=1'

# 3. Проверить очереди
curl -s -u voiceiq:voiceiq_dev_password http://192.168.10.69:15672/api/queues/%2F \
  | python3 -c "import sys,json; [print(q['name'], 'ready:', q['messages_ready']) for q in json.load(sys.stdin)]"

# 4. Проверить результаты
docker exec voiceiq-postgres-1 psql -U voiceiq \
  -c "SELECT id, status FROM transcription.transcripts ORDER BY created_at DESC LIMIT 5;"
```

---

## Известные проблемы

### bcrypt 5.x несовместим с passlib 1.7.4
**Сервис:** auth-service — `bcrypt==4.0.1` в requirements.txt

### alembic_version — изоляция схем
Каждый сервис использует свою схему для версий (`version_table_schema` в `alembic/env.py`). Без этого сервисы мешают друг другу.

### Whisper таймаут
Увеличен до 1800 сек в `whisper_client.py`. На i5-4210U 19-минутный файл транскрибируется ~10-20 мин.

---

## Продакшен (после MVP)

- **Яндекс Managed PostgreSQL** — managed БД
- **Яндекс Object Storage** — замена MinIO
- **GPU-сервер** — Whisper large-v3, LLM локально (замена временного 1BitAI)
- **Kubernetes (Yandex Cloud)** — горизонтальное масштабирование воркеров
