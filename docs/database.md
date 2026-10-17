# База данных VoiceIQ

Одна БД `voiceiq` в контейнере `voiceiq-postgres-1`, один пользователь `voiceiq` для всех сервисов. Каждый сервис ведёт свою схему через Alembic, таблица версий лежит в той же схеме (`<schema>.alembic_version`, в `public` её нет).

Подключение (только SELECT без согласия пользователя):
```bash
docker exec -i voiceiq-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off' <<'SQL'
SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1,2;
SQL
```
Внешних ключей между схемами нет: связи держатся на UUID в коде. Удаление в одной схеме не чистит другие.

## Версии миграций (проверено 2026-10-17)
| Схема | Сервис | Версия |
|---|---|---|
| auth | auth-service | 0005 (org_locale) |
| admin_schema | admin-service | 0001 |
| recorder | recorder-service | 0003 (scorable_categories) |
| transcription | transcription-service | 0003 (speaker_confidence) |
| analytics | analytics-engine | 0013 (offer_amount) |
| scripts | scripts-service | 0009 (rules_multi_store_seller) |
Миграции запускаются `alembic upgrade head` внутри контейнера сервиса. dashboard-service своей схемы не имеет. Таблицы `analytics.seller_tips`, `demand_items`, `upsell_plans` созданы миграциями 0010/0012, но моделей в `app/models.py` у них нет: работа с ними идёт сырым SQL в analytics-engine/app/routers/coach.py и dashboard-service.

## Размеры (pg_stat n_live_tup, 2026-10-17)
recordings 12 527 · transcripts 12 524 · transcript_segments 114 094 · conversations 12 524 · conversation_scores 81 128 · conversation_offers 11 539 · refresh_tokens 1 096 · users 4 · organizations 4 · stores 11 · sellers 26 · devices 7 · audio_chunks 0 · mobile_accounts 2 · super_admins 0.

## auth
| Таблица | Ключевые поля |
|---|---|
| organizations | id, name, slug (unique), org_type `retail`/`telephony`, industry (`coffee`, `pharmacy`, `electronics`, ... или NULL), currency (RUB/KZT/...), timezone (IANA), is_active |
| users | id, organization_id → organizations (RESTRICT), email (уникален только в паре с организацией: `uq_users_org_email`), password_hash (bcrypt 12), role `director`/`admin`/`rop`/`manager`, store_id (обязателен для manager), is_active |
| refresh_tokens | user_id → users (CASCADE), token_hash (bcrypt от JWT), expires_at, revoked |
| rop_store_assignments | rop_user_id, store_id, organization_id — магазины РОПа |
| mobile_accounts | organization_id, seller_id (unique в паре), store_id, invitation_hash/expires_at (sha256 ссылки, 24 ч), refresh_hash/expires_at (sha256, 30 дней), session_version, created_by |
| super_admins | email, password_hash, is_active — технические администраторы консоли (1 запись с 2026-10-17) |

Роль `employee` есть только в мобильных токенах (это продавец из `admin_schema.sellers`, не строка `users`).

## admin_schema
| Таблица | Ключевые поля |
|---|---|
| stores | organization_id, name, address, is_active |
| sellers | organization_id, store_id → stores, first_name, last_name, is_active. Это сотрудники, чьи разговоры пишутся; в кабинет они не входят |
| devices | serial_number (unique, им бейдж представляется в `/chunks`), store_id, seller_id (SET NULL), is_active, last_seen_at |
| privacy_settings | organization_id, store_id (NULL = вся сеть), retention_days, anonymize_transcripts (включает LLM-анонимизацию в анализе), consent_required |
| alert_settings, store_licenses | пороги алертов, лицензии магазинов (пусто) |

## recorder
`recordings` — одна строка на разговор (у бейджа строка появляется только после нарезки дня).

| Поле | Значения |
|---|---|
| source | `manual`, `mobile`, `badge`, `transcript`, `call_manual`, `call_webhook` |
| status | `processing` (manual/звонок, идёт STT в BackgroundTask) · `mobile_queued` → `mobile_processing` · `segmented` (бейдж, создана transcribe_worker'ом) · `transcribed` (STT готов или роли проставлены) · `analyzed` · `failed` · `filtered` (кофейня: не разговор с гостем, транскрипт и аудио удалены) |
| device_id | у всего, кроме бейджа, `00000000-0000-0000-0000-000000000000`; у готовых текстов случайный UUID |
| audio_path | `бакет/объект`, `transcript-only/{id}` или `''` после отсева |
| started_at | у бейджа — **время нарезки**, а не время разговора; у split-частей = started_at исходной + смещение |
| call_direction, client_phone, operator_phone, external_call_id | телефония |
| call_metadata (jsonb) | телефония: метаданные АТС; mobile: `{"sha256"}`; split: `{"split_from","part","parts","offset_ms","source_audio_path"}`; кофейный отсев: `{"context_filter": {category, confidence, reason}}` |
Комментарий статусов в services/recorder-service/app/models.py:30 устарел (`pending | stitching | ready ...` не используются).

`telephony_settings`: одна строка на организацию: webhook_token, is_enabled, default_store_id, default_seller_id, operator_channel (0/1), operator_mapping `{"101": seller_uuid}`, scorable_categories (NULL → `['sales']`).

`audio_chunks`: device_id, session_date, chunk_index, duration_ms, audio_path, timestamp_start/end, stitched. Сейчас пусто (бейджи не присылали).

## transcription
| Таблица | Поля |
|---|---|
| transcripts | recording_id (**unique**), organization_id, store_id, seller_id, full_text, language (до 10 символов: `ru`, `kk`, у старых `multi`; при `STT_LANGUAGE=kk` будет `kk` и для русской речи), duration_seconds, status `transcribed`/`diarized`, whisper_model (`deepgram-whisper` для любого STT, в том числе OpenRouter; `manual-upload` у готовых текстов) |
| transcript_segments | transcript_id → transcripts (CASCADE), segment_index, speaker_role `seller`/`customer`/`unknown`, speaker_id (кластер STT или номер канала), speaker_confidence (Deepgram, у Scribe NULL), text, start_ms/end_ms (от начала записи), avg_logprob |

## analytics
| Таблица | Что | Связь |
|---|---|---|
| conversations | итог анализа одной записи (поля ниже) | recording_id **unique**, transcript_id |
| conversation_script_results | результат по каждому скрипту: was_applied, script_score, violations, block_results, skip_reason, script_template_version_id | conversation_id (CASCADE) |
| conversation_scores | оценка шага скрипта: step_name, step_weight, score, evidence_text, step_detected | conversation_id |
| objections | type, is_resolved, resolution_technique, raw_text | conversation_id |
| conversation_compliance_violations | rule_id, rule_title, severity, evidence, explanation | conversation_id |
| conversation_offers | предложения продавца: item, category, kind upsell/cross_sell, technique, response, is_focus, quote, customer_quote, amount | conversation_id |
| conversation_demand | неудовлетворённый спрос: item, item_key, category, reason, outcome, analog, quote | conversation_id |
| coaching_items | пункты разбора руководителя; при повторном анализе переносятся на новый conversation | conversation_id |
| coin_rules / coin_sources / coin_events | мотивация «монеты»: версии правил, источники, начисления pending/confirmed/rejected/voided | recording_id |
| seller_tips | кэш советов LLM на день и аудиторию (employee/manager) | seller_id, tip_date, audience |
| demand_items, upsell_plans | статусы позиций спроса, план «товар дня» | organization_id |

Поля `analytics.conversations` и кто их заполняет (services/analytics-engine/worker/analyze_worker.py):
| Поле | Источник |
|---|---|
| overall_score | среднее script_score применённых скриптов; NULL, если звонок не оценивается (`is_scorable=false`) |
| outcome, outcome_confidence, topic, sentiment_avg | общий анализ (`_general_and_compliance`). При сбое LLM — `unknown`, 0, NULL, 0 |
| call_category, contact_reason, is_scorable | общий анализ для звонков + `telephony_settings.scorable_categories` |
| has_upsell/upsell_results, has_crosssell/crosssell_results | `_check_sell` по правилам scripts-service |
| offer_opportunity, offers_count, offers_accepted, check_total, order_items, offer_missed, offer_better_phrase | разбор допродаж `_analyze_offers` (только не звонки) |
| talk_ratio, interruptions_count, longest_monologue_seconds, silence_ratio | app/dynamics.py, без LLM |
| summary, summary_generated_at | по запросу из карточки: POST `/api/v1/analytics/conversations/{id}/summary` |
| session_date | из recordings.session_date (иначе `date.today()` по UTC) |
| llm_model, analyzed_at, status (`analyzed`) | служебные |
Повторный анализ удаляет старую строку conversations (дочерние таблицы уходят каскадом) и создаёт новую.

## scripts
script_templates (script_type `staged` по шагам или fulltext по блокам; scope; applies_to_all_stores; short_name) → script_steps (weight, is_required, example_phrases) / script_blocks (is_mandatory) / script_template_versions (snapshot jsonb). Назначения: seller_script_assignments, store_script_assignments (is_mandatory). Правила: upsell_rules и cross_sell_rules (trigger_product, required_offers, store_ids[], seller_ids[]), compliance_rules (severity, keywords[]), objection_types (code, label, is_default).

## Организации (2026-10-17)
| slug | Что | Пользователи кабинета | Магазины / продавцы | Записи |
|---|---|---|---|---|
| demo | исходная демо-организация; её директор — гость витрин (DOMAIN_ORG_GUESTS) | 1 director | 4 / 8 | badge 49 (2 failed), mobile 7, transcript 9 |
| horeca-demo | демо кофеен (синтетика + тестовые загрузки), витрина horeca.voicer-ai.pro и mobile.voicer-ai.pro | 1 manager | 3 / 9 | transcript 6 312, mobile 14, manual 4 |
| pharmacy-demo | демо аптек, витрина pharma.voicer-ai.pro | **нет своих** (вход только как гость из demo) | 3 / 8 | transcript 6 128 |
| coffee-demo | CoffeeDemo, создана 2026-10-16: KZT, Asia/Almaty, industry coffee (по заметкам и по работе фильтра) | 1 director, 1 manager | 1 / 1 | manual 1, mobile 3 (1 filtered) |
Не проверено 2026-10-17 (SELECT по organizations и users заблокировал автоматический классификатор доступа): industry/currency/timezone для demo, horeca-demo, pharmacy-demo; адреса почты. По коду: витрины кофеен и аптек привязаны к slug, а не к industry (services/analytics-engine/app/routers/coach.py:117 и services/dashboard-service/app/routers/coins.py:218, upsell.py:128 проверяют `slug == 'horeca-demo'`).

## Права ролей при чтении записей
| Роль | Видит |
|---|---|
| director, admin | вся организация |
| rop | магазины из `rop_stores` токена |
| manager | свой store_id |
| employee (только приложение) | свои мобильные записи (`seller_id`) |
| service (X-Internal-Key) | всё, без фильтра по организации |
Реализация: services/recorder-service/app/routers/recordings.py:20 (кабинет, `filtered` скрываются), services/recorder-service/app/routers/mobile.py:34 (приложение).
