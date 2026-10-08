# Интеграция с телефонией MANGO OFFICE

Документ описывает, как подключить Виртуальную АТС (ВАТС) MANGO OFFICE к Voicer:
как устроен обмен данными, как звонок попадает в наш пайплайн анализа, как
сопоставляются операторы АТС с менеджерами Voicer, и что для этого должен сделать
клиент. Опирается на «API MANGO OFFICE» (версия от 24.06.2026) и на текущую
реализацию приёма звонков ([telephony.py](../services/recorder-service/app/routers/telephony.py)).

---

## 1. Ключевые факты об API MANGO OFFICE

**Две модели работы:**
- **API ВАТС** — управление Виртуальной АТС, получение событий и записей звонков. **Нам нужна именно она.**
- **API КЦ** (Контакт-центр) — статусы операторов, сделки, кампании обзвона. Для MVP не требуется.

**Базовый адрес API:** `https://app.mango-office.ru/vpbx/`

**Авторизация (в обе стороны):**
- `vpbx_api_key` — уникальный код ВАТС клиента (идентифицирует систему).
- `vpbx_api_salt` — ключ подписи. **В запросах не передаётся**, известен обеим сторонам.
- Подпись каждого запроса: `sign = sha256(vpbx_api_key + json + vpbx_api_salt)`.
- **Подписываются ВСЕ запросы — и наши к Mango, и вебхуки Mango к нам.** Значит, входящие
  вебхуки мы можем **достоверно верифицировать**, пересчитав `sign`.
- Тело запроса — `application/x-www-form-urlencoded` с полями `json`, `vpbx_api_key`, `sign`.

**Модель обмена — push + pull:**
- Mango **не присылает аудио** в вебхуке. Она шлёт **события** (call/recording/summary/…),
  а сам файл записи мы **забираем сами** отдельным подписанным запросом. Это отличает Mango
  от нашего текущего generic-вебхука, который ждёт готовый `recording_url`.
- Mango вызывает наши URL по HTTPS (TLS 1.2, без SSLv3/TLS 1.0-1.1). Нужен публичный HTTPS-эндпоинт.
- Опционально Mango ограничивает свои исходящие IP; на нашем ingress надо разрешить входящие
  запросы Mango с адресов: `81.88.80.132`, `81.88.80.133`, `81.88.82.36`, `81.88.82.44`, `81.88.82.45`.

**Лимиты:** есть ограничения на частоту запросов к API (раздел 1.4); при `503`/`5008` —
экспоненциальный backoff и повтор.

---

## 2. События Mango, которые нам нужны

Mango шлёт несколько событий на **разные URL** (настраиваются в ЛК). Все они коррелируются
по `entry_id` — внутреннему идентификатору группы вызовов (это НЕ SIP Call-ID).

| Событие | URL по умолчанию | Что даёт нам | Используем? |
|---|---|---|---|
| Завершение вызова | `events/summary` | `entry_id`, `call_direction` (0 внутр./1 вход./2 исход.), `from{extension,number}`, `to{extension,number}`, `line_number`, времена (`create_time`/`talk_time`/`end_time`), `entry_result` (1 успех / 0 пропущен), `disconnect_reason`, `sip_call_id` | **Да** — метаданные звонка |
| Запись в облаке | `events/record/added` | `entry_id`, `recording_id`, `user_id` (сотрудник ВАТС), `product_id` | **Да** — триггер «запись готова к скачиванию» |
| Уведомление о записи | `events/recording` | `recording_id`, `recording_state` (Started/Continued/Completed), `extension`, `call_id`, `entry_id` | Опц. — прогресс/диагностика |
| Тематики распознаны | `events/record/tagged` | `entry_id`, `recording_id`, `user_id` | Опц. — если используем тематики Речевой аналитики |
| Вызов / DTMF / SMS | `events/call`, `events/dtmf`, `events/sms` | телеметрия | Нет для MVP (можно логировать) |

**Почему нужны два события (`summary` + `record/added`):**
- `record/added` даёт `recording_id` (чем скачать) и `user_id` (кто оператор), но **не даёт**
  номер клиента и направление.
- `summary` даёт направление и номер клиента, но не `recording_id`.
- Оба содержат `entry_id` → коррелируем по нему.

**Получение файла записи** (раздел 3.5.1, самый защищённый способ):
1. `POST https://app.mango-office.ru/vpbx/queries/recording/post` с `json = {"recording_id": "...", "action": "download"}` (подписываем `sign`).
2. Ответ `302 Found` → в `Location` временная одноразовая ссылка на файл.
3. `GET` этой ссылки → `audio/mpeg` (mp3). Ссылка **одноразовая и временная — не сохраняем**.

Записи, удалённые в ЛК Mango, через API недоступны. Сразу после звонка запись может быть
ещё не готова — при неудаче повторяем запрос через ~1 минуту (событие `record/added` как раз
и сигнализирует готовность, поэтому обычно повтор не нужен).

> Если подключена «Речевая аналитика», запись стерео (левый канал −1 / правый 1). Это позволяет
> использовать наш существующий путь **канальной диаризации** (роли по каналам без LLM,
> `transcribe_audio_multichannel`).

**Сопоставление операторов** (раздел 3.7.1):
- `POST https://app.mango-office.ru/vpbx/config/users/request` → список сотрудников ВАТС:
  `general{name,email,department,position,user_id}` + `telephony{extension, numbers[], ...}`.
- Даёт связку `extension` ↔ `user_id` ↔ ФИО/email — основу для маппинга на наших менеджеров.

---

## 3. Архитектура интеграции в Voicer

Приём Mango делаем **отдельным коннектором**, не ломая generic-вебхук и ручную загрузку.
Существующая цепочка обработки переиспользуется полностью — новый код только «на входе».

```
Mango ВАТС                         recorder-service                     остальной пайплайн
──────────                         ───────────────                     ──────────────────
 звонок завершён
   │ POST events/summary  ─────►  /telephony/mango/{token}/summary
   │                               ├─ verify sign
   │                               └─ upsert mango_calls[entry_id] = метаданные
   │
 запись готова
   │ POST events/record/added ─►  /telephony/mango/{token}/record_added
   │                               ├─ verify sign
   │                               ├─ resolve seller (user_id/extension → mapping)
   │                               ├─ resolve store (default)
   │                               └─ enqueue background: pull_recording(entry_id, recording_id)
   │
   ◄── POST queries/recording/post (sign)
   ── 302 Location ──►
   ◄── GET временная ссылка
   ── mp3 ──►                      _create_call_recording(...)  ─────►  _process_call_audio
                                   (source="call_mango",                 ├─ stereo → канальная
                                    external_call_id=entry_id)           │   диаризация → queue.analyze
                                                                         └─ mono → queue.diarize
                                                                             (далее анализ, скоринг,
                                                                              is_scorable, summary — как
                                                                              для любого звонка)
```

Ниже пайплайн не меняется: `is_call_context()` в analytics-engine, телефонийные исходы,
классификация `call_category`/`is_scorable`, резюме диалога, группировка по номеру клиента —
всё работает, потому что запись сохраняется как обычный звонок (`call_direction`, `client_phone`,
`operator_phone`, `external_call_id`, `call_metadata`).

### 3.1. Хранение настроек коннектора

Расширяем существующую модель настроек телефонии (либо, с прицелом на несколько провайдеров —
UIS/Bitrix24 из планов фазы 3, — выносим в отдельную таблицу `telephony_connectors`). Для MVP
достаточно добавить в `recorder.telephony_settings`:

| Поле | Назначение |
|---|---|
| `provider` | `'generic'` \| `'mango'` — какой коннектор активен |
| `mango_api_key` | `vpbx_api_key` клиента |
| `mango_api_salt` | ключ подписи (хранить **шифрованно**, это секрет) |
| `operator_mapping` | уже есть: `{ "<extension>": "<seller_id>" }` |
| `operator_user_mapping` | новое: `{ "<user_id>": "<seller_id>" }` — т.к. `record/added` даёт `user_id` |

`webhook_token` (уже есть) используем как непубличный идентификатор организации в URL
(маршрутизация), а подлинность запроса проверяем по `sign`.

### 3.2. Staging-таблица для корреляции по `entry_id`

Так как события приходят по частям и в произвольном порядке, нужна лёгкая staging-таблица
`recorder.mango_calls`:

| Поле | Источник |
|---|---|
| `organization_id`, `entry_id` (PK) | оба события |
| `call_direction`, `client_phone`, `operator_extension`, `line_number`, times | `summary` |
| `recording_id`, `mango_user_id` | `record/added` |
| `recording_id_pulled` (bool), `recording_id` (наш Recording.id) | после скачивания |
| `created_at`, `updated_at` | |

Логика:
- на `summary` — upsert метаданных;
- на `record/added` — upsert `recording_id`/`user_id` и, если звонок «оцениваемый»
  (`entry_result=1`, был разговор), запуск фоновой задачи скачивания;
- дедуп по `entry_id` (Mango может ретраить вебхуки) — как сейчас по `external_call_id`.

`external_call_id` в нашей `recordings` = `entry_id` Mango (даёт идемпотентность и обратную связь).

### 3.3. Клиент Mango

Небольшой модуль `app/mango_client.py`:
- `sign(json_str) -> sha256(api_key + json_str + salt)`;
- `verify(json_str, sign) -> bool` (constant-time сравнение) — для входящих вебхуков;
- `async get_recording_url(recording_id) -> str` (POST recording/post, вернуть `Location`);
- `async download_recording(recording_id) -> (bytes, ext)`;
- `async list_users() -> [...]` (config/users/request) — для экрана сопоставления.

### 3.4. Новые эндпоинты (recorder-service)

```
POST /api/v1/recorder/telephony/mango/{token}/summary
POST /api/v1/recorder/telephony/mango/{token}/record_added
POST /api/v1/recorder/telephony/mango/{token}/recording      # опционально, прогресс
GET  /api/v1/recorder/telephony/mango/operators              # список сотрудников Mango для маппинга (JWT)
```

Каждый вебхук: найти org по `{token}` → достать `mango_api_salt` → пересчитать `sign` из
поля `json` → при несовпадении `401`. Тело — form-urlencoded (`json`, `vpbx_api_key`, `sign`).

### 3.5. Обработка после скачивания

`pull_recording` переиспользует уже существующие функции без изменений:
- `_create_call_recording(... source="call_mango", direction, client_phone, operator_phone,
  external_call_id=entry_id, call_metadata={sip_call_id, disconnect_reason, line_number, ...})`;
- `_process_call_audio(... channel_mode="auto")` — стерео уйдёт в канальную диаризацию и
  сразу в `queue.analyze`, моно — в `queue.diarize`.

### 3.6. Альтернатива/бэкофилл: Statistics API

Realtime push — основной путь. Для добора истории или если вебхуки не дошли, можно опросить
`API Статистика` (раздел 3.4) — вернёт список звонков с `recording_id`, по которым тем же
способом скачиваем записи. Полезно для первичной загрузки архива при онбординге.

---

## 4. Сопоставление менеджеров (операторы Mango → менеджеры Voicer)

**Проблема:** Mango идентифицирует оператора двумя способами:
- в `summary`/`recording` — **`extension`** (внутренний номер, напр. «123»);
- в `record/added`/`record/tagged` — **`user_id`** (внутренний числовой id сотрудника ВАТС).

Оба надо привести к нашему `seller_id`.

**Решение — экран «Настройки → Телефония → Сопоставление операторов»:**

1. Кнопка **«Загрузить операторов из Mango»** дёргает `config/users/request` и показывает
   таблицу сотрудников ВАТС: ФИО, email, отдел, `extension`, `user_id`.
2. Рядом с каждым — выпадающий список наших менеджеров (`sellers`) для выбора соответствия.
3. **Автоподбор:** предлагаем совпадение по email, затем по ФИО, если такой менеджер уже есть
   в Voicer (директор подтверждает/правит).
4. Сохраняем сразу две карты: `operator_mapping{extension→seller_id}` и
   `operator_user_mapping{user_id→seller_id}`.

**Порядок разрешения оператора в вебхуке:**
```
seller_id = operator_user_mapping[record_added.user_id]        # приоритет — точный id
         ?? operator_mapping[summary.to.extension]             # запасной — по добавочному
         ?? default_seller_id                                  # если оператор не распознан
```
`store_id` (отдел/точка) для телефонии обычно один — берём `default_store_id` из настроек
(или маппим отдел `department` из Mango на наши `stores`, если у клиента их несколько).

Новых сотрудников в Mango подхватываем повторным «Загрузить операторов» (можно фоново раз в сутки).

---

## 5. Что должен сделать клиент для подключения (простыми словами)

### Шаг 1. Подключить услуги в личном кабинете Mango
В ЛК MANGO OFFICE (`https://lk.mango-office.ru`):
- **Интеграции → API коннектор → «Подключить API коннектор»** — без этого API-команды не работают.
- Подключить услугу **«Речевая аналитика»** — тогда доступны записи и расшифровки, а записи идут
  в стерео (лучше разделяются реплики оператора и клиента).
- Записи разговоров должны сохраняться в **«Облачное хранилище»** (иначе их нельзя забрать по API).

### Шаг 2. Скопировать ключи доступа
Там же, на странице **API коннектор**, скопировать:
- **Уникальный код вашей ВАТС** (`vpbx_api_key`);
- **Ключ создания подписи** (`vpbx_api_salt`).

### Шаг 3. Ввести ключи в Voicer
В Voicer: **Настройки → Телефония**:
- выбрать провайдера **«MANGO OFFICE»**;
- вставить **код ВАТС** и **ключ подписи**;
- включить приём звонков.

После сохранения Voicer покажет **готовые URL для событий** (с секретным токеном внутри) —
их надо скопировать в Mango.

### Шаг 4. Прописать адреса событий в Mango
В ЛК Mango (API коннектор → настройки событий/уведомлений) указать наши URL:
- «Уведомление о завершении вызова» → `.../mango/<токен>/summary`
- «Запись помещена в облако» → `.../mango/<токен>/record_added`
- (по желанию) «Уведомление о записи» → `.../mango/<токен>/recording`

Если в Mango включён список разрешённых IP для входящих запросов от внешней системы — добавить
IP-адрес нашего сервера. И наоборот, на нашей стороне открыть входящие с IP Mango
(`81.88.80.132/133`, `81.88.82.36/44/45`).

### Шаг 5. Сопоставить операторов с менеджерами
В Voicer: **Настройки → Телефония → Сопоставление операторов** → **«Загрузить операторов из Mango»**.
Появится список сотрудников из Mango — напротив каждого выбрать соответствующего менеджера Voicer
(часть подставится автоматически по email/ФИО). Сохранить.

### Шаг 6. Проверить
Сделать один тестовый звонок. Через 1–2 минуты после его завершения он должен появиться в списке
разговоров Voicer — с направлением, номером клиента, привязкой к менеджеру, транскриптом и оценкой.

---

## 6. Открытые вопросы / решения на будущее

- **Шифрование `mango_api_salt`** в БД (это секрет доступа к записям клиента).
- **Один или несколько `store`** у телефонийных клиентов: маппинг `department` Mango → `stores`.
- **Тематики Речевой аналитики** Mango (`record/tagged`, `recording_categories`) — можно
  импортировать как готовые теги причин обращения, дополнив нашу LLM-классификацию.
- **Первичная загрузка архива** через Statistics API при онбординге.
- Обобщение до мультипровайдерной модели (`telephony_connectors`) для UIS/Bitrix24 (фаза 3).
```
