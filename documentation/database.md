# Схема базы данных

VoiceIQ использует единую PostgreSQL-инстанцию с логическим разделением на схемы (schemas). Каждый микросервис владеет своей схемой и не обращается напрямую к чужим таблицам — только через API соответствующего сервиса.

Все данные изолированы по `organization_id` — ключевому полю мультитенантной архитектуры.

---

## Схема `auth` — Аутентификация и пользователи

### `organizations`

Компании-клиенты VoiceIQ. Каждая компания — отдельная изолированная организация.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор организации |
| `name` | string | Название компании |
| `slug` | string UNIQUE | Короткий идентификатор (для URL) |
| `is_active` | bool | Активна ли организация |
| `created_at` | timestamp | Дата создания |
| `updated_at` | timestamp | Дата последнего изменения |

### `users`

Пользователи клиентского приложения (`app.voiceiq.ru`).

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Уникальный идентификатор |
| `organization_id` | UUID FK → organizations | Организация пользователя |
| `email` | string UNIQUE (в рамках org) | Email (логин) |
| `password_hash` | string | Хеш пароля (bcrypt) |
| `first_name` | string | Имя |
| `last_name` | string | Фамилия |
| `role` | enum | `director` / `admin` / `rop` / `manager` |
| `store_id` | UUID FK → stores, nullable | Привязка к магазину (только для manager) |
| `is_active` | bool | Активен ли аккаунт |
| `created_at` | timestamp | Дата создания |
| `updated_at` | timestamp | Дата последнего изменения |

> **Несколько менеджеров на один магазин:** несколько пользователей с ролью `manager` могут иметь одинаковый `store_id`. Ограничение «один магазин» означает, что менеджер работает только со своим магазином — но сам магазин может иметь нескольких менеджеров.

### `rop_store_assignments`

Назначение РОПов на магазины (many-to-many).

| Поле | Тип | Описание |
|------|-----|---------|
| `rop_user_id` | UUID FK → users | Пользователь с ролью `rop` |
| `store_id` | UUID FK → stores | Магазин |
| `assigned_at` | timestamp | Дата назначения |

Primary key: (`rop_user_id`, `store_id`)

### `refresh_tokens`

Выданные refresh-токены для обновления JWT.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `user_id` | UUID FK → users | Владелец токена |
| `token_hash` | string | Хеш токена (не сам токен) |
| `expires_at` | timestamp | Когда истекает |
| `created_at` | timestamp | Когда выдан |

### `super_admins`

Внутренние пользователи VoiceIQ (`admin.voiceiq.ru`). Хранятся отдельно от клиентских пользователей.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `email` | string UNIQUE | Email |
| `password_hash` | string | Хеш пароля |
| `full_name` | string | Имя |
| `is_active` | bool | Активен ли |
| `created_at` | timestamp | Дата создания |

---

## Схема `admin_schema` — Организационная структура

### `admin_schema.stores`

Торговые точки (магазины).

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `name` | string | Название магазина |
| `address` | string | Адрес |
| `is_active` | bool | Активна ли точка |
| `created_at` | timestamp | Дата добавления |
| `updated_at` | timestamp | Дата последнего изменения |

### `admin_schema.sellers`

Продавцы (физические сотрудники).

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `store_id` | UUID FK → admin_schema.stores | Магазин |
| `first_name` | string | Имя продавца |
| `last_name` | string | Фамилия продавца |
| `is_active` | bool | Работает ли сейчас |
| `created_at` | timestamp | Дата добавления в систему |
| `updated_at` | timestamp | Дата последнего изменения |

> **Важно:** `sellers` — это физические люди, не пользователи системы. Продавец не имеет логина в VoiceIQ. Профиль продавца создаётся менеджером вручную в разделе «Команда». Аккаунты (таблица `users`) — только у менеджеров и руководителей.

> **Деактивация (увольнение):** при увольнении устанавливается `is_active = false` (soft delete). Привязка к бейджу (`badge_id`) обнуляется — устройство освобождается и может быть назначено другому продавцу. Все исторические данные разговоров сохраняются.

> **Реактивация:** если продавец вернулся — `is_active` возвращается в `true`, профиль и история разговоров восстанавливаются без потерь.

### `admin_schema.devices`

Аудиобейджи.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `store_id` | UUID FK → admin_schema.stores | Магазин |
| `seller_id` | UUID FK → admin_schema.sellers, nullable | К кому привязан |
| `serial_number` | string UNIQUE | Серийный номер устройства (глобально уникален) |
| `model` | string | Модель устройства |
| `is_active` | bool | Активно ли устройство |
| `last_seen_at` | timestamp | Последняя активность |
| `created_at` | timestamp | Дата регистрации |
| `updated_at` | timestamp | Дата последнего изменения |

### `admin_schema.privacy_settings`

Настройки приватности и соответствия 152-ФЗ. Поддерживают два уровня: **организация** и **магазин**.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `store_id` | UUID FK → admin_schema.stores, **nullable** | Магазин (NULL = настройки уровня организации) |
| `retention_days` | int | Срок хранения файлов и транскриптов (по умолчанию 90) |
| `anonymize_transcripts` | bool | Замена ФИО на [ПРОДАВЕЦ]/[КЛИЕНТ] |
| `consent_required` | bool | Требуется ли согласие клиента |
| `updated_at` | timestamp | Дата последнего изменения |

**Логика наследования:** если для магазина нет своей записи (`store_id` = конкретный магазин) — используются настройки уровня организации (`store_id = NULL`). Запись магазина полностью переопределяет орг-настройки (не мержится).

### `admin_schema.store_licenses`

Лицензии на уровне магазина. Лицензия разрешает подключение бейджей к магазину.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `store_id` | UUID FK → admin_schema.stores | Магазин |
| `is_active` | bool | Лицензия активна |
| `starts_at` | timestamp | Начало периода лицензии |
| `expires_at` | timestamp | Конец периода (NULL = бессрочно) |
| `granted_by` | UUID FK → super_admins | Super Admin, выдавший лицензию |
| `notes` | text, nullable | Комментарий (например, «триал 14 дней») |
| `created_at` | timestamp | |

> **Логика:** если у магазина нет активной лицензии — бейджи не могут быть привязаны к его продавцам. Существующие данные не удаляются. Super Admin создаёт и продлевает лицензии вручную через `admin.voiceiq.ru`.

---

### `admin_schema.alert_settings`

Настраиваемые пороги для алертов (по организации или магазину).

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `store_id` | UUID FK → admin_schema.stores, nullable | Магазин (NULL = для всей орг.) |
| `score_threshold` | int | Порог низкого скоринга (по умолчанию 60, шкала 0–100) |
| `no_activity_hours` | int | Нет записей X часов → алерт (по умолчанию 4) |
| `email_recipients` | text[] | Список email для уведомлений |
| `is_active` | bool | Включены ли алерты |
| `updated_at` | timestamp | Дата последнего изменения |

---

## Схема `recorder` — Записи

### `recordings`

Метаданные аудиозаписей. Каждая запись — один отдельный разговор, физически вырезанный из суточного файла и сохранённый как отдельный WAV.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор записи |
| `organization_id` | UUID NOT NULL | Организация |
| `store_id` | UUID NOT NULL | Магазин |
| `seller_id` | UUID NOT NULL | Продавец |
| `device_id` | UUID NOT NULL | Устройство-бейдж |
| `session_date` | DATE | Дата рабочей смены |
| `started_at` | TIMESTAMPTZ | Начало разговора (абсолютное UTC) |
| `ended_at` | TIMESTAMPTZ | Конец разговора |
| `duration_seconds` | int | Длительность разговора в секундах |
| `audio_path` | string | Путь к WAV-файлу разговора в MinIO: `voiceiq-recordings/{org_id}/{store_id}/{seller_id}/{date}/{id}.wav` |
| `file_size_bytes` | bigint | Размер файла разговора |
| `status` | enum | `pending` / `stitching` / `ready` / `segmented` / `transcribing` / `transcribed` / `failed` |
| `error_message` | text | Сообщение об ошибке (если status=failed) |
| `created_at` | TIMESTAMPTZ | Время создания записи |
| `updated_at` | TIMESTAMPTZ | Время последнего обновления |

---

## Схема `transcription` — Транскрипты

### `transcripts`

Результат транскрибации — полный текст разговора.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `recording_id` | UUID UNIQUE | Исходная запись (один транскрипт на запись) |
| `organization_id` | UUID NOT NULL | Организация |
| `store_id` | UUID NOT NULL | Магазин |
| `seller_id` | UUID NOT NULL | Продавец |
| `full_text` | text | Полный текст разговора одной строкой |
| `language` | string | Язык (например, `ru`) |
| `duration_seconds` | int | Длительность в секундах |
| `status` | enum | `transcribed` / `diarized` / `failed` |
| `whisper_model` | string | Модель Whisper, использованная при транскрибации (для аудита) |
| `created_at` | TIMESTAMPTZ | Время создания |

### `transcript_segments`

Разговор разбитый на сегменты — с таймкодами и ролями спикеров.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `transcript_id` | UUID FK → transcripts | Транскрипт |
| `speaker_role` | enum | `seller` / `customer` / `unknown` |
| `text` | text | Текст сегмента |
| `start_ms` | INTEGER | Начало в миллисекундах (от начала разговора) |
| `end_ms` | INTEGER | Конец в миллисекундах |
| `segment_index` | INTEGER | Порядковый номер реплики |
| `avg_logprob` | NUMERIC(6,4) | Уверенность Whisper |

Сегменты используются для: синхронизации аудиоплеера с текстом, подсветки возражений в нужном месте транскрипта.

---

## Схема `scripts` — Скрипты продаж

### `script_templates`

Шаблоны скриптов. Существуют на двух уровнях: организации и менеджера.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `name` | string | Название шаблона |
| `description` | text | Описание |
| `scope` | enum | `org_level` — виден всем; `manager_level` — виден только создателю |
| `context_description` | text, nullable | Описание контекста применения (для контекстных скриптов). LLM использует это поле для скрининга. Пример: «Применять при продаже смартфонов и мобильных устройств» |
| `is_active` | bool | Активен (false = soft delete) |
| `created_by` | UUID FK → users | Кто создал |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

> **Правило видимости:** `manager` видит только `scope = org_level` + свои `scope = manager_level`. `director`/`admin` видят все скрипты организации.

### `script_steps`

Этапы скрипта. Набор этапов произвольный — создатель сам определяет названия и количество.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `template_id` | UUID FK → script_templates | Шаблон |
| `step_order` | int | Порядковый номер |
| `name` | string | Название этапа (произвольное) |
| `description` | text | Что должен делать продавец |
| `weight` | float (0–1) | Вес в итоговом балле (сумма по шаблону = 1.0) |
| `is_required` | bool | Обязательный ли |
| `recommendation_text` | text, nullable | Шаблонная рекомендация при низком выполнении этапа |

### `seller_script_assignments`

Назначение скриптов продавцам (many-to-many).

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор |
| `organization_id` | UUID FK → organizations | Организация |
| `seller_id` | UUID FK → sellers | Продавец |
| `template_id` | UUID FK → script_templates | Назначенный скрипт |
| `is_mandatory` | bool | `true` — применяется к каждому разговору; `false` — применяется только если LLM признал скрипт контекстно применимым |
| `assigned_by` | UUID FK → users | Кто назначил (manager / admin / director) |
| `assigned_at` | timestamp | Дата назначения |

> Уникальность по `(seller_id, template_id)` — один скрипт нельзя назначить продавцу дважды.

---

## Схема `analytics` — Результаты AI-анализа

### `conversations`

Центральная таблица аналитики — итог анализа каждого разговора.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | Идентификатор разговора |
| `organization_id` | UUID FK → organizations | Организация |
| `recording_id` | UUID FK → recordings | Запись |
| `transcript_id` | UUID FK → transcripts | Транскрипт |
| `seller_id` | UUID FK → sellers | Продавец |
| `store_id` | UUID FK → stores | Магазин |
| `overall_score` | float, nullable | Среднее по всем скриптам (0–100). NULL если скриптов нет |
| `outcome` | enum | `purchase` / `deferred` / `price_refusal` / `competitor` / `unknown` |
| `outcome_confidence` | float | Уверенность в классификации исхода |
| `duration_seconds` | int | Длительность разговора |
| `topic` | text | Тема разговора (название товара) |
| `sentiment_avg` | float | Средняя эмоциональная окраска (-1 до 1) |
| `recorded_at` | timestamp | Время разговора |
| `analyzed_at` | timestamp | Время завершения анализа |
| `created_at` | timestamp | |

### `conversation_script_results`

Результат оценки разговора по одному конкретному скрипту. Одна запись = один скрипт + один разговор. Создаётся для **каждого назначенного** скрипта — и применённых, и пропущенных.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | |
| `conversation_id` | UUID FK → conversations | Разговор |
| `script_template_id` | UUID FK → script_templates | Скрипт |
| `script_name` | string | Копия названия на момент анализа |
| `was_applied` | bool | `true` — скрипт применён и вошёл в скор; `false` — пропущен (контекст не подошёл) |
| `script_score` | float (0–100), nullable | Взвешенная оценка. NULL если `was_applied = false` |
| `violations` | text[] | Список нарушений (пустой если нет или `was_applied = false`) |
| `skip_reason` | text, nullable | Обоснование LLM почему скрипт не применим. NULL если `was_applied = true` |

### `conversation_scores`

Детализация скоринга по этапам каждого скрипта.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | |
| `conversation_id` | UUID FK → conversations | Разговор |
| `script_template_id` | UUID FK → script_templates | К какому скрипту относится этап |
| `script_step_id` | UUID FK → script_steps | Этап скрипта |
| `score` | float (0–100) | Оценка выполнения этапа |
| `evidence_text` | text | Цитата, подтверждающая оценку |
| `step_detected` | bool | Был ли этап вообще в разговоре |

### `objections`

Возражения клиента, найденные в разговоре.

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID PK | |
| `conversation_id` | UUID FK → conversations | Разговор |
| `type` | enum | `price` / `quality` / `competitors` / `timing` / `trust` / `not_ready` / `functionality` |
| `is_resolved` | bool | Закрыл ли продавец возражение |
| `resolution_technique` | text | Какой техникой закрыл |
| `transcript_segment_id` | UUID FK → transcript_segments | Ссылка на сегмент (для подсветки) |
| `raw_text` | text | Исходная фраза клиента |

---

## Политика хранения данных

При истечении срока хранения (настраивается в `privacy_settings.retention_days`) **удаляются одновременно**:
- Аудиофайлы из MinIO
- Записи из `transcripts` и `transcript_segments`
- Записи из `recordings`

**Не удаляются** (аналитика не является персональными данными):
- `conversations` — итоговые результаты анализа
- `conversation_scores` — скоринг по этапам
- `objections` — возражения

Это позволяет сохранить исторические тренды и статистику даже после удаления исходных записей.

---

## Индексы и производительность

Основные индексы для быстрых запросов дашборда:

```sql
-- Основные фильтры дашборда
CREATE INDEX idx_conversations_org_store_recorded ON conversations(organization_id, store_id, recorded_at DESC);
CREATE INDEX idx_conversations_seller_recorded ON conversations(seller_id, recorded_at DESC);
CREATE INDEX idx_conversations_outcome ON conversations(outcome);

-- Для фильтрации по скорингу
CREATE INDEX idx_conversations_score ON conversations(overall_score);

-- Для агрегаций возражений
CREATE INDEX idx_objections_conversation ON objections(conversation_id);
CREATE INDEX idx_objections_type ON objections(type);

-- Для мультитенантности
CREATE INDEX idx_stores_organization ON stores(organization_id);
CREATE INDEX idx_sellers_organization ON sellers(organization_id);
```

---

## Миграции

Управление схемой через Alembic. Каждый сервис хранит свои миграции в `services/{service}/migrations/`. При старте контейнера автоматически выполняется `alembic upgrade head`.
