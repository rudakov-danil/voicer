# План доработки MVP VoiceIQ

Дата составления: 2026-05-10
Ветка: `nikita_dev_09052026`
Текущая готовность MVP: ~85%

В план включены только задачи MVP из эпиков **1, 3, 4, 5, 7**. Эпик 2 (запись через бейдж, управление устройствами) и эпик 8 (деплой, мониторинг, тестирование) — вне периметра этого плана.

---

## Сводка по нереализованным задачам

| # | Эпик | Задача | Оценка |
|---|------|--------|--------|
| 1 | 1. Архитектура | Rate limiting в API Gateway (nginx) | 0.5 дня |
| 2 | 3. Транскрибация | Подсветка возражений и апсейла в тексте транскрипта | 1 день |
| 3 | 4. Скрипты | Backend CRUD правил апсейла (продукт → обязательные допы) | 1 день |
| 4 | 5. AI-анализ | Апсейл-модуль в analytics-engine (детекция, классификация, привязка к правилам) | 2 дня |
| 5 | 7. Приватность | Маскирование ПД в транскриптах (regex + LLM-NER) | 2 дня |
| 6 | 7. Приватность | Cron-job автоудаления записей по `retention_days` | 2 дня |

**Итого:** ~8.5 рабочих дней.

---

## Спринт 1. Приватность и апсейл (≈7 дней)

Эти задачи блокируют B2B-пилот: без 152-ФЗ — продаж не будет, без апсейла — теряется ключевая бизнес-метрика.

### 1.1. Маскирование ПД в транскриптах (2 дня)

**Эпик:** 7. Администрирование → Настройки приватности (152-ФЗ)
**Сервис:** `transcription-service`

**Файлы:**
- Новый: `services/transcription-service/app/anonymizer.py`
- Изменить: `services/transcription-service/worker/diarize_worker.py`
- Изменить: `services/transcription-service/app/models.py` (поле `text_anonymized`)
- Миграция: `services/transcription-service/alembic/versions/0002_anonymized_text.py`
- Тесты: `services/transcription-service/tests/test_anonymizer.py`

**Логика:**
1. Regex-маски в `anonymizer.py`:
   - Телефоны (`+7/8 ...`, разные форматы)
   - Номера карт (16 цифр с пробелами/дефисами, валидация Луна)
   - Паспорта (`\d{4}\s?\d{6}`)
   - Email
   - СНИЛС
2. LLM-fallback для имён клиентов: промт "найди упоминания ФИО клиента в тексте, верни список". Использовать существующий `llm_client.py`.
3. В `diarize_worker` после получения сегментов:
   - Читать `privacy_settings.anonymize_transcripts` для организации (HTTP-клиент к admin-service уже есть)
   - Если `true` — пропускать `text` через `anonymizer.anonymize(text)` перед сохранением
4. Хранить два поля: `text` (оригинал) и `text_anonymized`. API отдаёт нужное в зависимости от настроек.
5. Маски: телефон → `+7XXXXXXXXX1`, карта → `**** **** **** 1234`, паспорт → `**** ******`, ФИО → `[Клиент]`.

**Тесты:**
- Фикстуры с разными форматами ПД
- Проверка что `text` остаётся нетронутым
- Проверка что `text_anonymized` корректно маскирует

**Зависимости:** нет.

---

### 1.2. Cron-job автоудаления записей (2 дня)

**Эпик:** 7. Администрирование → Настройки приватности (152-ФЗ)
**Сервис:** `recorder-service`

**Файлы:**
- Новый: `services/recorder-service/worker/retention_worker.py`
- Изменить: `docker-compose.yml` (добавить контейнер `retention-worker`)
- Тесты: `services/recorder-service/tests/test_retention_worker.py`

**Логика:**
1. Запуск раз в сутки (через `apscheduler` или `while True: sleep(86400)`)
2. Для каждой организации:
   - Читать `retention_days` из admin-service `GET /api/v1/admin/privacy-settings`
   - Найти `recordings` где `created_at < now() - retention_days` И `status IN ('analyzed', 'failed')`
   - Удалить файл из MinIO (`minio_client.delete_object()` уже есть)
   - Удалить запись из `recorder.recordings` (CASCADE удалит `transcripts`, `transcript_segments`, `conversations`, `conversation_script_results`, `objections`)
3. Structured-лог по каждому удалению: `{"event": "retention_cleanup", "org_id": ..., "recording_id": ..., "age_days": ...}`
4. Prometheus-метрика: `retention_deletions_total{organization_id}`

**Критично:**
- Удалять только записи в финальном статусе, чтобы не убить «зависшие» в обработке
- Проверить что FK CASCADE настроены во всех миграциях (если нет — добавить)
- Безопасность: dry-run режим через env `RETENTION_DRY_RUN=true` — только логировать, не удалять (для первого запуска в проде)

**Зависимости:** нет.

---

### 1.3. CRUD правил апсейла (1 день)

**Эпик:** 4. Шаблоны скриптов продаж
**Сервис:** `scripts-service`

**Файлы:**
- Новый: `services/scripts-service/app/routers/upsell_rules.py`
- Изменить: `services/scripts-service/app/models.py` (модель `UpsellRule`)
- Изменить: `services/scripts-service/app/schemas.py`
- Изменить: `services/scripts-service/app/main.py` (подключить роутер)
- Миграция: `services/scripts-service/alembic/versions/0002_upsell_rules.py`
- Frontend: `services/frontend/src/api/scripts.ts`, `services/frontend/src/pages/ScriptsPage.tsx` (заменить мок)
- Тесты: `services/scripts-service/tests/test_upsell_rules.py`

**Схема БД:**
```sql
CREATE TABLE scripts.upsell_rules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES auth.organizations(id),
  store_id uuid NULL REFERENCES admin_schema.stores(id),  -- null = на всю организацию
  product_category text NOT NULL,                          -- "Смартфон"
  required_addons text[] NOT NULL,                         -- ["Расширенная гарантия", "Чехол"]
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_upsell_rules_org_active ON scripts.upsell_rules(organization_id, is_active);
```

**Endpoints:**
- `GET /api/v1/scripts/upsell-rules?store_id=...` — список (с organization-isolation)
- `POST /api/v1/scripts/upsell-rules` — создать
- `PUT /api/v1/scripts/upsell-rules/{id}` — обновить
- `DELETE /api/v1/scripts/upsell-rules/{id}` — soft-delete (через `is_active=false`)

**Frontend:**
- В `ScriptsPage.tsx:8` сейчас захардкожен мок-массив `mockUpsellRules`. Заменить на `useQuery({ queryFn: scriptsApi.getUpsellRules })`
- Добавить inline-редактор: добавление строки, удаление, переключение active
- Использовать существующий `<table>`-стиль из мокапа

**Зависимости:** блокирует задачу 1.4 (апсейл-модуль читает эти правила).

---

### 1.4. Апсейл-модуль в analytics-engine (2 дня)

**Эпик:** 5. AI-анализ → Определение статуса по апсейлу
**Сервис:** `analytics-engine`

**Файлы:**
- Изменить: `services/analytics-engine/app/models.py` (поля в `Conversation`)
- Изменить: `services/analytics-engine/app/prompt_builder.py` (промт `analyze_upsell`)
- Изменить: `services/analytics-engine/app/response_parser.py` (Pydantic-модель ответа)
- Изменить: `services/analytics-engine/worker/analyze_worker.py` (новый этап)
- Изменить: `services/analytics-engine/app/routers/conversations.py` (отдавать новые поля)
- Миграция: `services/analytics-engine/alembic/versions/0002_upsell_fields.py`
- Frontend: `services/frontend/src/types/index.ts`, `services/frontend/src/pages/ConversationsPage.tsx` (заменить bool на детальный статус)
- Тесты: `services/analytics-engine/tests/test_upsell_analyzer.py`

**Поля в `analytics.conversations`:**
```sql
ALTER TABLE analytics.conversations ADD COLUMN
  upsell_status text NULL CHECK (upsell_status IN ('completed','partial','missed','not_applicable')),
  upsell_product_category text NULL,
  upsell_offered_addons text[] NULL DEFAULT '{}',
  upsell_required_addons text[] NULL DEFAULT '{}',
  upsell_confidence numeric(3,2) NULL;
```

**Pipeline в `analyze_worker`:**
1. После определения исхода (`analyze_conversation`):
2. LLM-промт `detect_product_category`: "по транскрипту определи категорию продукта, который обсуждали (Смартфон/Ноутбук/...)". Возврат: `product_category` или `null`.
3. Если категория определена — `GET /api/v1/scripts/upsell-rules` для этой категории и магазина.
4. Если правил нет — `upsell_status = 'not_applicable'`, выходим.
5. LLM-промт `analyze_upsell`:
   ```
   Категория: {category}
   Обязательные допы: {required_addons}
   Транскрипт: {full_text}

   Какие из обязательных допов продавец предложил клиенту?
   Верни JSON: { "offered": [...], "confidence": 0.0-1.0 }
   ```
6. Классификация:
   - `len(offered) == len(required)` → `completed`
   - `len(offered) == 0` → `missed`
   - иначе → `partial`
7. Сохранить все поля в `Conversation`.

**Frontend:**
- `ConversationsPage.tsx:567` сейчас отрисовывает `has_upsell` (bool). Заменить на цветной тег:
  - `completed` → зелёный «Апсейл выполнен»
  - `partial` → оранжевый «Частично: 2 из 3»
  - `missed` → красный «Пропущен»
  - `not_applicable` → серый «—»
- В drawer разговора добавить блок «Апсейл»: список offered и required с галочками/крестами.

**Зависимости:** требует 1.3 (правила апсейла должны быть в БД).

---

## Спринт 2. UI и Gateway (≈1.5 дня)

### 2.1. Подсветка возражений и апсейла в транскрипте (1 день)

**Эпик:** 3. Транскрибация и диаризация → UI просмотра транскрипта
**Сервис:** `frontend`

**Файлы:**
- Изменить: `services/frontend/src/components/Drawer.tsx` или новый `services/frontend/src/components/TranscriptView.tsx`
- Использовать существующий CSS-класс `.highlight` в `services/frontend/src/index.css:690`

**Логика:**
1. API уже отдаёт:
   - `transcript_segments[]` с полями `start_ms`, `end_ms`, `text`, `speaker_role`
   - `objections[]` с `timestamp_ms`, `is_resolved`
   - `upsell_required_addons[]`, `upsell_offered_addons[]` (после задачи 1.4)
2. Для каждого сегмента:
   - Проверить, попадает ли `objections[].timestamp_ms` в диапазон `[start_ms, end_ms]`
   - Если попадает — обернуть фрагмент текста в `<span class="highlight highlight-objection">`
3. Цветовая схема (CSS):
   - Возражение закрытое — оранжевый бордер, зелёная заливка
   - Возражение незакрытое — красный бордер
   - Упоминание апсейл-допа предложенного — зелёная заливка
   - Упоминание апсейл-допа пропущенного — серая (то, что НЕ упомянуто, помечать в отдельном блоке снизу, не в тексте)
4. Tooltip при ховере: тип события + статус.

**Зависимости:** для апсейл-подсветки нужна задача 1.4. Подсветку возражений можно делать сразу.

---

### 2.2. Rate limiting в API Gateway (0.5 дня)

**Эпик:** 1. Микросервисная архитектура → API Gateway
**Сервис:** `nginx`

**Файлы:**
- Изменить: `nginx/nginx.conf`

**Конфиг:**
```nginx
http {
  limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;
  limit_req_zone $binary_remote_addr zone=api_auth:10m rate=5r/s;
  limit_req_zone $http_x_device_id zone=api_upload:10m rate=10r/s;

  server {
    location /api/v1/auth/ {
      limit_req zone=api_auth burst=10 nodelay;
      proxy_pass http://auth-service:8001;
    }

    location /api/v1/recordings/upload {
      limit_req zone=api_upload burst=20 nodelay;
      client_max_body_size 100M;
      proxy_pass http://recorder-service:8002;
    }

    location /api/v1/ {
      limit_req zone=api_general burst=50 nodelay;
      proxy_pass http://...;
    }
  }
}
```

**Логика:**
- Жёсткий лимит на `/auth/*` — защита от brute-force
- Отдельная зона по `device_id` для `/upload` — чтобы один сломанный бейдж не задушил остальные
- Общий лимит 30 r/s на IP для остальных API

**Зависимости:** нет.

---

## Порядок выполнения и зависимости

```
1.1 Маскирование ПД          ──┐
1.2 Retention cron           ──┤── параллельно (нет зависимостей)
1.3 CRUD правил апсейла      ──┤
2.2 Rate limiting nginx      ──┘

           ↓ (после 1.3)

1.4 Апсейл-модуль анализа

           ↓ (после 1.4)

2.1 Подсветка в транскрипте
```

**Возможный сплит между разработчиками:**
- Backend-инженер 1 (Дмитрий): 1.1, 1.2, 2.2
- Backend-инженер 2 (Danil): 1.3 → 1.4
- Frontend: 2.1 (после 1.4)

При параллельной работе двух человек — ~5 рабочих дней.

---

## Критерии готовности MVP

После выполнения всех задач плана MVP закрыт по эпикам 1, 3, 4, 5, 7. Останутся открытыми:
- Эпик 2 (real-world интеграция с конкретным вендором бейджей, UI устройств с батареей/онлайн)
- Эпик 8 (CI/CD, prod-деплой в Yandex Cloud, Grafana-дашборды, нагрузочные и E2E тесты)

Эти эпики идут отдельным треком.
