# Известные проблемы и долги

Состояние на 2026-10-17. Статусы: **открыто** (не исправлено), **временно** (сознательный тестовый режим), **риск** (по коду возможно, на данных не подтверждено), **инфо** (особенность, о которой надо помнить). «Не проверено» — вывод только по коду.

## Распознавание речи
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 1 | В `.env` `DEEPGRAM_LANGUAGE=auto-ru-kk`, а Deepgram всегда распознаёт казахским | `_listen` возвращается на первой строке с `language=kk`: services/recorder-service/app/deepgram_client.py:55, services/transcription-service/app/deepgram_client.py:54; тесты `test_language_choice.py` отключены | временно (тест по просьбе пользователя). Откат: удалить 2 строки с kk, раскомментировать блок ниже, убрать `pytestmark` в обоих сервисах, пересобрать группы recorder и transcription. Бэкап `~/voiceiq-backups/kk-hardcode-20261016-191934` |
| 2 | Стерео-звонки идут через Deepgram с kk, даже когда основной STT — OpenRouter | `transcribe_audio_multichannel` не смотрит на STT_PROVIDER (recorder deepgram_client.py:155) и использует тот же `_listen` | инфо + следствие п. 1 |
| 3 | `transcripts.language = kk` у русских разговоров; `whisper_model = deepgram-whisper` у записей OpenRouter | язык берётся из подсказки STT_LANGUAGE (openrouter_stt.py `_language`); whisper_model зашит в INSERT (services/recorder-service/app/routers/upload.py:313, telephony.py:483, services/transcription-service/worker/transcribe_worker.py:144) | открыто. По этим полям нельзя судить о языке и провайдере |
| 4 | У Scribe нет уверенности в спикере: перебивания не перепроверяются голосом | `speaker_confidence=None` (openrouter_stt.py `_segment`) → `uncertain_speaker_indexes` пуст | инфо |

## Конвейер и очереди
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 5 | Ручная загрузка или звонок навсегда в `processing` после перезапуска recorder-service | обработка в FastAPI BackgroundTasks: upload.py:115, telephony.py:212, :329; повторного подхвата нет (у мобильных есть) | открыто |
| 6 | Сообщение бесконечно возвращается в queue.analyze и блокирует очередь | `message.process(requeue=True)` (services/analytics-engine/worker/analyze_worker.py:823): любое исключение (например повторяющийся сбой фильтра кофейни :860 или БД) → requeue без счётчика | открыто |
| 7 | Сбой транскрибации дня бейджа или диаризации — запись пропадает из очереди | `nack(requeue=False)` без dead-letter: transcribe_worker.py:188, diarize_worker.py:178; запись остаётся `segmented`/`transcribed` | открыто |
| 8 | Ответ LLM в ```json ломает разбор в analytics-engine | `json.loads` без снятия обёртки: response_parser.py:405, analyze_worker.py:648, prompt_builder.py:918 (скрининг → скрипт пропускается), context_filter.py:71 (→ п. 6). Сейчас все вызовы идут с `response_format=json_object`, и 2026-10-17 фильтр кофейни отработал без ошибок | риск (распределение `outcome='unknown'` не проверено: SELECT был заблокирован) |
| 9 | Длинный разговор оценивается по выборке реплик | `_format_transcript` берёт каждую n-ю реплику, если их > 80 (services/analytics-engine/app/prompt_builder.py:206) | открыто; важно для бейджа и длинных звонков |
| 10 | У API и воркера разные версии кода на одной очереди | stitch, transcribe_full, analyze, cache.invalidate слушают по два процесса (architecture.md); сейчас recorder-worker и dashboard-worker на более старых образах | **решено 2026-10-17 16:05 UTC**: все группы пересобраны вместе, дрейфа нет; пересобирать группами и дальше |
| 11 | Даты смены за прошлый день у ночных записей в Казахстане | `date.today()` по UTC: telephony.py:183, services/transcription-service/app/routers/upload_transcript.py:152, analyze_worker.py:1041 (если нет session_date) | открыто для бэкенда; во фронтенде исправлено правкой -tz1017 |
| 12 | Кофейня: аудио и транскрипт удаляются без возможности восстановить | фильтр «не гость» с confidence ≥ 0.9 (services/analytics-engine/app/context_filter.py:49) → services/recorder-service/app/routers/context.py:63-93 удаляет conversations, transcript и объект MinIO; запись `filtered` скрыта из списков | инфо (так задумано, релиз horeca-context 2026-10-17). Пример: мобильная запись coffee-demo отсеяна как `microphone_test` |

## Бейдж (сейчас не используется: audio_chunks пуст)
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 13 | Время разговоров бейджа = время обработки | `started_at = datetime.now()` (transcribe_worker.py:102) | открыто |
| 14 | Реплики на границе разговоров теряются | в разговор попадают только сегменты, целиком лежащие в окне (transcribe_worker.py:126) | открыто |
| 15 | Догруженные позже чанки дают второй full_day.wav только из новых кусков | склеиваются только `stitched=false` (stitch_worker.py:63), объект перезаписывается по тому же пути (:82) | открыто |
| 16 | Двойной `?heartbeat=0` в URL | `RABBITMQ_URL` уже содержит параметр, transcribe_worker.py:193 дописывает ещё раз | риск; сейчас подключение работает (consumers=2) |

## Безопасность
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 17 | Кто угодно из интернета может создать запись в любой организации или сменить статус | `POST /api/v1/recorder/recordings/internal` и `PATCH /recordings/{id}/status` без авторизации (services/recorder-service/app/routers/recordings.py:157, :185), nginx проксирует весь `/api/v1/recorder/` | открыто (не проверялось запросом, только по коду и nginx) |
| 18 | Данные бейджа по серийному номеру без авторизации; загрузка чанков только по серийнику | services/admin-service/app/routers/devices.py:109, services/recorder-service/app/routers/chunks.py:35 | открыто |
| 19 | Swagger всех сервисов открыт снаружи | `location /docs/<svc>/` в nginx/nginx.conf:62-68 | открыто |
| 20 | Вебхук телефонии скачивает любой http(s)-адрес с сервера (в том числе внутренние `minio:9000`) | services/recorder-service/app/routers/telephony.py:346; нужен валидный токен организации | открыто, низкий риск |

## Авторизация
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 21 | Обновление токена со временем медленнее | `/refresh` проверяет bcrypt'ом все неотозванные refresh-токены пользователя, без фильтра по сроку (services/auth-service/app/routers/auth.py:131-143); логины копят строки (1 096 токенов на 4 пользователей) | риск (время не замерено) |
| 22 | Один email в двух организациях → ошибка 500 при входе | `scalar_one_or_none` по email без организации (auth.py:108), уникальность только `(organization_id, email)`; `reset_password.sh` меняет пароль во всех организациях сразу | открыто |
| 23 | Смена роли в форме «Пользователи системы» молча не сохраняется | `UserUpdateRequest` без `role` (services/auth-service/app/schemas.py:58) | открыто (пароль исправлен 2026-10-17) |
| 24 | ~~Суперадмина нет, организации создаются вручную~~ | с 2026-10-17 есть консоль техадмина (раздел «Консоль технического администратора») | решено |
| 25 | Поведение демо зависит от slug, а не от настроек | `slug == 'horeca-demo'`: services/analytics-engine/app/routers/coach.py:117, services/dashboard-service/app/routers/coins.py:218, upsell.py:128 | инфо |
| 26 | Казахский в scripts-service не учитывается (импорт документов, тест скрипта) | свой LLM-клиент без LANGUAGE_NOTE (services/scripts-service/app/llm_client.py) | открыто |

## Фронтенд и инфраструктура
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 27 | Следующий полный релиз фронтенда может вернуть исправленные ошибки | правки -tz1017 и -np1017 есть в `src` (проверено 2026-10-17). Правки -sc1017 (автопрокрутка, `ConversationPage.tsx`) в `src` нет: этого файла нет ни на сервере, ни на GitHub. Описание правки — `services/frontend/HOTFIXES.md` в `master` | открыто (только -sc1017) |
| 28 | Голый `docker compose up -d` поднимет мониторинг с открытыми портами | prometheus/node-exporter/grafana описаны, но не запущены | инфо |
| 29 | `.env` с дублями и переменными, которые не доходят до сервисов | LLM_MAX_PARALLEL_SCRIPTS, LLM_MAX_TOKENS, WHISPER_SERVER_URL не передаются в compose; LLM_SCRIPT_TIMEOUT и др. записаны дважды | инфо |
| 30 | Тесты с БД не запускаются в контейнерах | testcontainers без docker.sock | не проверено |
| 31 | Тесты релизов 2026-10-17 не лежат в `services/analytics-engine/tests` | скопированы только код и `test_prompt_builder.py` | открыто |
| 32 | `apteka.voicer-ai.pro` в DOMAIN_ORGS, но сайта в host-nginx нет; `/api/v1/users/` в nginx ведёт в несуществующий префикс | services/auth-service/app/config.py:18, nginx/nginx.conf:27 | инфо |
| 33 | Комментарий статусов записи не совпадает с реальными | services/recorder-service/app/models.py:30 | инфо (реальные статусы — database.md) |
| 34 | 2 записи бейджа в demo в статусе `failed` | причина не выяснялась | инфо |
| 42 | Падает юнит-тест `analytics-engine/tests/test_response_parser.py::test_parse_general_analysis_invalid_outcome` (ждёт `LLMResponseParseError` на неизвестный outcome, исключения нет) | в `app/response_parser.py:62-66` валидатор `_valid_outcome` теперь превращает неизвестный исход в `unknown` (единый справочник исходов, релиз horeca-fix), а тест не обновили. Падал и на образе до 2026-10-17 16:07 | открыто: поведение кода, похоже, задумано, нужно обновить тест |
| 43 | Фронтенд кабинета нельзя собрать ни из сервера, ни из GitHub | в `services/frontend/src` нет `pages/ConversationPage.tsx`, `pages/DemandPage.tsx` и `pages/Home*`, на которые ссылается `App.tsx`. 2026-10-17 искали везде и не нашли: все ветки и вся история `Freezy113/voiceiq` (там только собранные чанки в `backup-*`), другие репозитории Freezy113, вся ФС сервера, 28 архивов в `~/deploy-backups`, `~/releases`, `~/voiceiq-backups`, Docker-образы и тома, ПК пользователя. Source map в dist нет. Полный `src` есть только на машине, где собирали релизы (Mac, файлы `._*`). Скорее всего, у того, кто 2026-10-17 05:42–06:32 UTC выкатил horeca-fix и horeca-context | **отложено**: пользователю сказали, что исходники скоро выложат. Когда появятся — проверить, что в них есть правки `-tz1017` и `-np1017`, внести `-sc1017` по `services/frontend/HOTFIXES.md` (в `master`), убедиться, что `npm run build` проходит (собирать не на сервере) |

## Перезагрузка сервера и очереди (2026-10-17)
| # | Симптом | Причина | Статус |
|---|---|---|---|
| 35 | После перезагрузки сервера у queue.stitch, transcribe_full, analyze и cache.invalidate по 1 слушателю вместо 2: встроенные слушатели API-сервисов не поднимаются, а `/health` при этом отвечает ok | в `app/main.py` recorder-service, transcription-service, analytics-engine и dashboard-service слушатель запускается фоновой задачей `asyncio.create_task(start_consuming())`. Первый `aio_pika.connect_robust` (в 9.4.1 переподключает только уже установленное соединение) падает с `ConnectionRefusedError`, пока RabbitMQ стартует, и задача молча завершается. `try/except` вокруг `create_task` (recorder main.py:22-27, transcription main.py:22-25) эту ошибку не ловит. Воркеры восстанавливаются, потому что у них падает весь процесс и Docker его перезапускает. `depends_on: rabbitmq: service_healthy` в compose уже есть (:185, :245, :333, :381), но при загрузке хоста Docker его не учитывает | **решено 2026-10-17 16:07 UTC**. В 4 файлах `app/main.py` слушатель запускается через `_consume_forever(name, start)`: при ошибке пишет в лог `<очередь> consumer failed, retrying in 5 s` и повторяет попытку каждые 5 с, `CancelledError` пробрасывает. Лишний try/except в recorder и transcription убран, код воркеров не менялся. Проверено: RabbitMQ остановлен, 4 API-сервиса перезапущены, после старта RabbitMQ слушатели вернулись за ~10 с. Бэкап — `~/voiceiq-backups/rabbit-reconnect-20261017-160536`, git — `backup-20261017-210907`. Все 4 группы пересобраны, дрейф версий у recorder-worker и dashboard-worker (№10) устранён. Если после перезагрузки consumers всё же 1 — смотреть логи API-сервиса по строке `consumer failed` |

Перезагрузка 2026-10-17 15:42–15:44 UTC: в журнале `Power key pressed short`, затем `Powering off`. То есть ВМ выключили кнопкой питания со стороны облака: из консоли или API облака, либо это было обслуживание у провайдера. Это не unattended-upgrades: `Automatic-Reboot` закомментирован, ядро 6.8.0-147 установлено ещё 2026-10-14. Кто выключил, видно только в аудите облака.

## Изоляция организаций (данные нескольких организаций в общих таблицах)
Модель хранения: одна БД `voiceiq` и общие таблицы для всех организаций. Чья строка — показывает колонка `organization_id`, у дочерних таблиц — через родителя. Сама модель (shared tables, multi-tenant) нормальная для текущего масштаба, отдельные схемы или базы на организацию не нужны. Проблема в том, что изоляцию обеспечивает только код каждой ручки.

| # | Симптом | Причина | Статус |
|---|---|---|---|
| 36 | Один забытый фильтр — и чужие данные утекают; база этому не мешает | нет Row-Level Security; фильтр `WHERE organization_id = <из токена>` пишется вручную в каждой ручке всех сервисов (~100 ручек) | **открыто, отложено** |
| 37 | Ошибка или взлом любого сервиса даёт доступ ко всем организациям (расшифровки, телефоны клиентов, хэши паролей) | все сервисы ходят в БД под одним пользователем `voiceiq` с правами на все схемы | **открыто, отложено** |
| 38 | Изоляцию можно обойти без авторизации | №17–18: `POST /recorder/recordings/internal`, `PATCH /recordings/{id}/status`, `/recorder/chunks*`, `GET /admin/devices/by-serial/{serial}` | **открыто, отложено** (первое по приоритету) |
| 39 | Утечка `INTERNAL_SERVICE_KEY` даёт доступ ко всему | роль `service` полностью снимает фильтр по организации (transcription, admin, scripts) | **открыто, отложено** |
| 40 | Аудио всех организаций лежит в одном бакете MinIO | `voiceiq-recordings/{org}/...`: разделение только по префиксу пути, доступ контролирует код recorder | инфо, отложено |
| 41 | Нет автотестов на изоляцию | нет проверок «пользователь A запрашивает данные B → 403/404» | **открыто, отложено** |

Предложенный порядок (согласовать с пользователем):
1. Закрыть ручки без авторизации (№17–18 / №38): это быстро и даёт больше всего.
2. Проверить все ручки на фильтр по организации (только чтение): составить список мест, где фильтра нет или где `organization_id` берётся из запроса, а не из токена. Добавить тесты «A не видит данные B».
3. Включить Row-Level Security на ключевых таблицах (recordings, transcripts, transcript_segments, conversations, users, sellers, stores и т. д.). Сервис в начале транзакции выполняет `SET app.org_id = ...`, и политика отсекает чужие строки. Для роли `service` и консоли техадмина — отдельный пользователь БД с `BYPASSRLS`. Делать и тестировать на копии базы, не на живой.
4. По желанию — отдельные пользователи БД для сервисов, с правами только на свои схемы.

Консоль техадмина видит все организации намеренно.

## Бэклог: задумано, но не сделано
Собрано 2026-10-17 из `MVP_PLAN.md` (план от 2026-05-10, файл удалён) и исходной документации. Из `MVP_PLAN` уже сделаны: правила допродаж (`scripts.upsell_rules`, кросс-сейл), модуль допродаж в анализе (`has_upsell`/`upsell_results`, разбор предложений `conversation_offers`), анонимизация транскриптов (через LLM, `REDACTION_SYSTEM_PROMPT`, если `privacy_settings.anonymize_transcripts`; regex-масок и отдельного `text_anonymized` нет — сегменты перезаписываются).

| Задача | Замысел | Что есть сейчас |
|---|---|---|
| Автоудаление по сроку хранения (152-ФЗ) | раз в сутки для каждой организации/магазина удалять записи старше `privacy_settings.retention_days` в финальных статусах (`analyzed`, `failed`, `filtered`): объект MinIO, `recorder.recordings`, `transcription.transcripts` и сегменты. Аналитику (`analytics.conversations`, оценки, возражения) **не удалять** — в ней нет ПД, тренды сохраняются. Внешних ключей между схемами нет, поэтому удалять явно по `recording_id` в каждой схеме. Сначала режим dry-run (только лог), лог по каждому удалению | настройка `retention_days` хранится, задачи нет |
| Rate limiting | в compose-nginx `limit_req_zone`: `/api/v1/auth/` ~5 r/s на IP (защита от перебора паролей), загрузки отдельно, остальное ~30 r/s на IP. Учесть, что за host-nginx реальный IP приходит в `X-Real-IP`/`X-Forwarded-For` | нет; в консоли техадмина есть свой лимит на вход |
| Подсветка возражений и допродаж в транскрипте | в карточке разговора выделять реплики с возражениями (закрытые / незакрытые) и предложениями | не проверено: исходника `ConversationPage.tsx` нет (№43) |
| Dead Letter Queue | 3 попытки, затем DLQ и алерт | очереди без dead-letter (№6, №7) |
| Redis-blacklist токенов | отзыв access-токена при выходе | выход отзывает только refresh-токены в БД |
| Приглашение первого администратора по email | техадмин создаёт организацию, владелец получает письмо со ссылкой | директор создаётся сразу с паролем (консоль техадмина) |
| Регистрация бейджа по QR, блокировка записи без лицензии | QR на корпусе, лицензия на магазин разрешает запись | бейдж заводится вручную; лицензии справочные |
| Экспорт CSV/Excel | выгрузка разговоров | в dashboard-service есть роутер `export` — проверить, что умеет |
| Шифрование хранилища, аудит-лог | AES-256 для MinIO/БД, журнал доступа к ПД | нет |
| Мониторинг | Prometheus + Grafana + алерты по очередям | описаны в compose, не запущены |
