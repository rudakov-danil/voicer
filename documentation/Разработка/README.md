# Документация разработчика VoiceIQ

Полная техническая документация всех микросервисов VoiceIQ с кодом и архитектурой.

## Сервисы

### 1. [Auth Service](auth-service.md)
Аутентификация и авторизация
- JWT токены (access/refresh)
- RBAC: director, admin, rop, manager
- Управление пользователями и организациями
- Файлы: config, database, models, schemas, security, routers

### 2. [Admin Service](admin-service.md)
Администрирование системы
- Управление магазинами, продавцами, устройствами
- Настройки приватности и алертов
- Контроль доступа по ролям
- Файлы: models, routers (stores, sellers, devices, settings)

### 3. [Recorder Service](recorder-service.md)
Приём и stitching аудио
- Загрузка WAV-чанков с устройств
- Аутентификация по device_id
- Склеивание (stitching) чанков в полный файл дня
- MinIO для хранения
- Файлы: models, routers (chunks, recordings), worker (stitch_worker)

### 4. [Transcription Service](transcription-service.md)
Транскрипция и diarization
- Whisper для STT
- Segmentation разговоров через LLM
- Diarization (определение ролей speaker/customer)
- Файлы: models, routers, whisper_client, diarization, workers (transcribe, diarize)

### 5. [Analytics Engine](analytics-engine.md)
AI-анализ разговоров
- Проверка скриптов продаж
- Определение исходов (покупка, отказ, etc.)
- Анализ возражений клиентов
- Выставление оценок
- Файлы: models, routers, scorer, worker (analyze_worker)

### 6. [Scripts Service](scripts-service.md)
Управление скриптами продаж
- Шаблоны скриптов с этапами
- Назначение скриптов продавцам
- Взвешенная система оценок
- Файлы: models, routers (templates, assignments)

### 7. [Dashboard Service](dashboard-service.md)
Дашборд и метрики
- Сводка метрик продавцов
- Список разговоров с фильтрацией
- Экспорт в CSV/XLSX
- Алерты (email)
- Redis кэширование с инвалидацией
- Файлы: routers (overview, sellers, conversations, export, alert_settings), worker (cache_invalidation)

## Структура документации

Каждый файл содержит:
1. **Описание сервиса** — назначение и основной функционал
2. **Принципы работы** — архитектура и логика обработки данных
3. **Входные/выходные данные** — API endpoints, RabbitMQ очереди, БД таблицы
4. **Полный код** — все Python-файлы в блоках с указанием пути

## Технический стек

- **Backend**: FastAPI, SQLAlchemy async, pydantic
- **БД**: PostgreSQL 16
- **Message Queue**: RabbitMQ
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **AI**: Whisper (STT), LLM (LLaMA/Qwen, Ollama)
- **Auth**: JWT (HS256, bcrypt)

## Дата создания

2026-03-26

## Организация

По каждому сервису указаны:
- Точные пути к файлам (формат `/e/voiceIQ/services/{service}/...`)
- Полный исходный код без сокращений
- Структура таблиц БД с типами полей
- REST API endpoints с параметрами
- RabbitMQ очереди и payload структуры
