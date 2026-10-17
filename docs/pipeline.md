# Путь записи, распознавание речи и LLM

Проверено по коду на сервере 2026-10-17 (после утренних релизов horeca-fix и horeca-context). Номера строк — по этому состоянию. Сокращения: `rec` = services/recorder-service, `trs` = services/transcription-service, `ana` = services/analytics-engine.

## 1. Источники записи

### Ручная загрузка (кабинет → «Загрузить аудио»)
1. `POST /api/v1/recorder/upload` (form: file .wav/.mp3/.ogg ≤ 500 МБ, seller_id, store_id, session_date; JWT кабинета) — rec/app/routers/upload.py:48.
2. Файл → MinIO `voiceiq-recordings/{org}/{store}/{seller}/{date}/{id}{ext}`; INSERT recordings `status=processing, source=manual` (:89; store_id сначала пишется как seller_id и тут же исправляется UPDATE на :109).
3. `BackgroundTasks` → `_transcribe_and_enqueue` (:135): `transcribe_audio` (STT, раздел 2). Ошибка STT → `failed`.
4. Если `SPLIT_MANUAL_UPLOADS` и сегментов > 1 (:168): `find_conversations` → HTTP в trs `/internal/segment-conversations` (LLM, раздел 3) → `plan_parts` (rec/app/conversation_split.py:48). Две и больше части → `_save_split_parts` (:214): первая часть остаётся под исходным id, остальные — новые recordings с `call_metadata.split_from`; аудио режется pydub, целый файл остаётся в MinIO.
5. `_save_transcript_and_enqueue` (:292): transcripts (`transcribed`, whisper_model `deepgram-whisper`) + segments (`speaker_role=unknown`) → recordings `transcribed` → `queue.diarize` с audio_path.

### Мобильное приложение (mobile.voicer-ai.pro)
1. `POST /api/v1/recorder/mobile/upload` (webm/mp4/m4a/ogg ≤ 100 МБ, client_upload_id, started_at с часовым поясом; мобильный или кабинетный токен) — rec/app/routers/mobile.py:66.
2. recording_id = `uuid5(org, "mobile:{sub}:{client_upload_id}")`; повтор с тем же sha256 → `duplicate: true`, с другим → 409. INSERT `status=mobile_queued, source=mobile, call_metadata.sha256`. Ответ 202.
3. Цикл `process_mobile_queue` (mobile.py:135, запускается в rec/app/main.py:29) раз в 5 с берёт до 20 записей `mobile_queued|mobile_processing`, ставит pg advisory lock, `mobile_processing`, скачивает аудио и вызывает тот же `_transcribe_and_enqueue`, что ручная загрузка (с разбиением на разговоры).
4. Статусы для приложения: `POST /api/v1/recorder/mobile/statuses`.

### Бейдж
1. `POST /api/v1/recorder/chunks` (WAV, device_id = **серийный номер**, chunk_index, session_date, timestamp_start/end) — rec/app/routers/chunks.py:19. Устройство проверяется через admin `/devices/by-serial` без авторизации. MinIO `voiceiq-audio-chunks`, INSERT `recorder.audio_chunks`.
2. `POST /api/v1/recorder/chunks/finalize` (total_chunks) → `queue.stitch` (chunks.py:92).
3. stitch_worker (rec/worker/stitch_worker.py:23): ждёт, пока чанков ≥ total_chunks, склеивает **только несклеенные** чанки → `voiceiq-audio-full/{org}/{device}/{date}/full_day.wav` → помечает stitched → `queue.transcribe_full` (:97).
4. transcribe_worker (trs/worker/transcribe_worker.py:36): STT всего дня → `segment_conversations` (LLM) → для каждой границы: вырезает WAV, кладёт в `voiceiq-recordings`, создаёт recordings `segmented` через HTTP `POST /api/v1/recorder/recordings/internal` (:105; started_at = текущее время, :102), сохраняет transcript и сегменты, **целиком** попавшие в окно (:126) → `queue.diarize` (без audio_path). В конце удаляет full_day.wav.
5. Ошибка → `nack(requeue=False)`: день теряется из очереди, full_day.wav остаётся.

### Телефония
- `POST /api/v1/recorder/telephony/calls` (JWT; wav/mp3/ogg, direction, client_phone, operator_phone, channel_mode auto|stereo|mono) — rec/app/routers/telephony.py:150, source `call_manual`.
- `POST /api/v1/recorder/telephony/webhook/{token}` (JSON с recording_url, external_call_id для дедупликации, operator_phone → `operator_mapping`) — telephony.py:249, source `call_webhook`. Запись скачивается по URL (до 300 с).
- Обработка `_process_call_audio` (:420) в BackgroundTasks:
  - стерео: `channel_mode=stereo` или auto + WAV с ≥ 2 каналами (rec/app/wav_utils.py) → `transcribe_audio_multichannel` (rec/app/deepgram_client.py:155, **всегда Deepgram**, даже при STT_PROVIDER=openrouter) → роль по каналу (`operator_channel` из telephony_settings) → transcripts `diarized` → сразу `queue.analyze` (:533);
  - моно или стерео не удалось (< 2 каналов с речью) → `transcribe_audio` → transcripts `transcribed` → `queue.diarize` (:536).
- Настройки: `GET/PUT /api/v1/recorder/telephony/settings` (director/admin).

### Готовая расшифровка (без аудио)
`POST /api/v1/transcription/upload-transcript` (JWT пользователя, не сервисный ключ; segments с ролями или raw_text «Продавец: …/Клиент: …») — trs/app/routers/upload_transcript.py:100. Создаёт recordings через recorder `/recordings/internal` (`source=transcript, status=transcribed, audio_path=transcript-only/{id}`, случайный device_id), transcript `diarized`, `language=ru`, `whisper_model=manual-upload`; без таймингов — 4 с на реплику → `queue.analyze`. Так загружены почти все данные horeca-demo и pharmacy-demo.

## 2. Распознавание речи
Точка входа одна: `transcribe_audio(audio_bytes, filename)` в `app/deepgram_client.py` (rec :108, trs :107). Копии в rec и trs должны совпадать (в trs нет multichannel). `app/openrouter_stt.py` в обоих сервисах идентичен.

| Переменная | Сейчас (.env) | Что делает |
|---|---|---|
| STT_PROVIDER | `openrouter` | `openrouter` → `openrouter_stt.transcribe` (rec deepgram_client.py:127); иначе Deepgram |
| STT_MODEL | дефолт `elevenlabs/scribe-v2` | модель OpenRouter |
| STT_LANGUAGE | `kk` | подсказка языка Scribe; `auto`/пусто — без подсказки (тогда казахский определялся как башкирский). С `kk` русская речь распознаётся нормально, но `transcripts.language` = `kk` |
| DEEPGRAM_LANGUAGE | `auto-ru-kk` | для Deepgram: язык, `auto` (detect_language) или `auto-ru-kk` (detect → при ru с уверенностью ≥ DEEPGRAM_RU_DETECT_MIN принять, иначе ru vs kk по средней уверенности слов). **Сейчас не действует**: `_listen` жёстко шлёт `kk` (rec :55, trs :54), блок выбора закомментирован ниже; тесты `tests/test_language_choice.py` в обоих сервисах помечены pytestmark skip |
| DEEPGRAM_MODEL | `nova-3` | |

OpenRouter: `POST {LLM_SERVER_URL без /v1}/v1/audio/transcriptions`, тело `{model, input_audio{data base64, format}, response_format: verbose_json, diarize: true, language?}`, ключ — `LLM_API_KEY` (тот же, что для LLM), таймаут 1800 с.

Формат результата обоих провайдеров:
```json
{"text": "...", "language": "kk",
 "segments": [{"start": 0.0, "end": 3.2, "text": "...", "speaker": 0,
               "speaker_confidence": 0.93, "avg_logprob": null,
               "sentences": [{"start": 0.0, "end": 1.4, "text": "...", "speaker_confidence": 0.95}]}]}
```
- Deepgram (`_parse_deepgram_response`, rec :237): сегмент = абзац (paragraphs), запасной вариант — utterances, затем весь текст. Если `speaker_confidence` абзаца < `SPEAKER_CONFIDENCE_MIN` (0.85), абзац режется на предложения — их потом перепроверяет diarize-worker.
- Scribe (openrouter_stt.parse_response): сегмент = подряд идущие слова одного спикера без паузы > 1.5 с; `speaker_confidence` всегда None (голосовая перепроверка не включается); коды ISO 639-3 переводятся в двухбуквенные.
- Многоканальный Deepgram: сегменты из utterances, `speaker` = номер канала, плюс `role`.

## 3. Сегментация на разговоры
- `segment_conversations` (trs/app/diarization.py:153), промпт `SEGMENTATION_SYSTEM_PROMPT` (:129, ru+kk маркеры приветствий/прощаний). Ответ — JSON-список `[{"start_ms","end_ms"}]`, ```json-обёртка снимается (:191). Пустой или битый ответ → один разговор на весь файл.
- Бейдж вызывает напрямую из transcribe_worker; ручная и мобильная загрузка — через HTTP `POST /api/v1/transcription/internal/segment-conversations` (trs/app/routers/segmentation.py, только X-Internal-Key).
- Нарезка ручной загрузки (rec/app/conversation_split.py): точка разреза — середина паузы между соседними разговорами (`_cut_points` :33); реплика уходит в разговор, куда попала её середина; абзац на стыке режется по предложениям; меньше двух непустых частей → файл не режется.

## 4. Диаризация (роли)
diarize_worker (trs/worker/diarize_worker.py:49), сообщение `queue.diarize`:
1. Нет сегментов: для кофейни (`industry=coffee`) всё равно `queue.analyze` (фильтр удалит), иначе ack и конец.
2. Имя продавца из admin `/admin/sellers/{id}`.
3. Есть сегменты с `speaker_confidence < 0.85` → `recheck_by_voice` (trs/app/voice_check.py): ECAPA-отпечаток реплики сравнивается с голосами спикеров по первой минуте уверенных реплик; при отрыве ≥ 0.1 спикер исправляется.
4. ≥ 2 разных speaker_id → `identify_speaker_roles` (diarization.py:456, промпт `SPEAKER_CLASSIFY_SYSTEM_PROMPT` :394, ответ `WORKERS: 0,2`; все работники → самый говорливый; без ответа → первый спикер). Иначе `diarize_segments` (:351, промпт `DIARIZATION_SYSTEM_PROMPT` :32, по одной букве S/C/U на реплику, пачками; до 250 реплик одним запросом).
5. speaker_role в сегменты, transcript `diarized`, `PATCH recorder /recordings/{id}/status?status=transcribed` → `queue.analyze`.
`ROLES_BY_LLM = True` (:21); False — роли по времени речи без LLM.

## 5. LLM-клиент
- Все сервисы ходят в OpenAI-совместимый API: `LLM_SERVER_URL` (OpenRouter), модель `LLM_MODEL_NAME` = `deepseek/deepseek-v4.1-flash` (2026-10-17). Дешёвая модель `LLM_CHEAP_MODEL` (пусто) используется для скрининга скриптов и анонимизации.
- `get_llm_client()` в ana и trs `app/llm_client.py` оборачивает `chat.completions.create`: добавляет `LANGUAGE_NOTE` (:34) в конец системного промпта, шлёт `reasoning: {enabled: false}` (при отказе провайдера один раз выключается), пишет в лог `LLM usage: step=<функция> model= prompt= completion= cost=`. Подсчёт расходов: `docker logs voiceiq-analytics-worker-1 | grep 'LLM usage'`.
- diarization.py дополнительно шлёт `reasoning_effort: none`.
- scripts-service (app/llm_client.py) — свой клиент **без** LANGUAGE_NOTE; вызовы: импорт документа в скрипт (routers/import_document.py:106), библиотека (library.py:192), тест скрипта (test_script.py:130), короткие имена (short_name.py:64).
- Большинство вызовов анализа идут с `response_format={"type":"json_object"}` и парсятся `json.loads` без снятия ```json (ana/app/response_parser.py:405, worker/analyze_worker.py:648, app/context_filter.py:71). Ошибки там не роняют анализ, а дают значения по умолчанию — см. known-issues.md.

## 6. Анализ (analytics-worker)
`process_analyze_message` (ana/worker/analyze_worker.py:818), сообщение `{recording_id, transcript_id, seller_id, store_id, organization_id}`:
| Шаг | Строка | LLM / промпт | Результат |
|---|---|---|---|
| 0. запись уже `filtered` → повторить очистку и выйти | :840 | — | — |
| 1. сегменты из trs `/transcripts/{recording_id}` (X-Internal-Key) | :51 | — | 404 → сообщение отбрасывается |
| 2. фильтр кофейни: industry=coffee и не звонок | :860 | `context_filter.SYSTEM_PROMPT` | `non_customer` с confidence ≥ 0.9 → recorder `/discard-context`: удаляет conversations, transcript, аудио, status `filtered`. Ошибка LLM → исключение → повтор из очереди |
| 3. скрипты, правила допродаж/кросс-сейла, комплаенс, типы возражений из scripts-service | :877 | — | |
| 4. динамика разговора | :899 | — (app/dynamics.py) | talk_ratio и др. |
| 5. скрининг необязательных скриптов с context_description | :909 | `SCREENING_SYSTEM_PROMPT` (cheap) | ошибка разбора → скрипт пропущен |
| 6. оценка скриптов (staged: `SCRIPT_SCORING_SYSTEM_PROMPT`; fulltext: `FULLTEXT_SCRIPT_SYSTEM_PROMPT`) параллельно, не больше 3 | :388 | | script_results, scores |
| 7. общий анализ + комплаенс одним вызовом (`_MERGED_*`, при сбое — раздельные `GENERAL_ANALYSIS_*` и `COMPLIANCE_CHECK_SYSTEM_PROMPT`) | :613, :932 | | outcome, topic, sentiment, objections, call_category, contact_reason, нарушения |
| 8. оцениваемость звонка по call_category | :961 | — | is_scorable, overall_score |
| 9. апсейл и кросс-сейл по правилам (`SELL_CHECK_SYSTEM_PROMPT`) + разбор допродаж (`OFFERS_SYSTEM_PROMPT`, только не звонки) | :976 | | has_upsell, has_crosssell, offers, unmet_demand |
| 10. анонимизация, если privacy_settings.anonymize_transcripts (`REDACTION_SYSTEM_PROMPT`, cheap) | :990 | | перезаписывает сегменты, full_text и цитаты |
| 11. сохранение: удалить старый conversation, перенести coaching_items, вставить всё | :1043–1210 | — | |
| 12. recordings `analyzed`, `queue.cache.invalidate` | :1214, :1220 | — | |
Отрасль (`organizations.industry`) подмешивает контекст в промпты: `INDUSTRY_CONTEXT` (ana/app/prompt_builder.py:627, сейчас coffee и pharmacy). Транскрипт для LLM форматируется `_format_transcript` (prompt_builder.py:206): больше 80 реплик → берётся каждая n-я.

Вне очереди (API analytics-engine): резюме разговора `POST /api/v1/analytics/conversations/{id}/summary` (`SUMMARY_SYSTEM_PROMPT`), советы продавцу `POST /api/v1/analytics/sellers/{id}/tips` (`TIPS_SYSTEM_PROMPT`/`MANAGER_REPORT_PROMPT`, кэш в analytics.seller_tips), повторный анализ `POST /api/v1/analytics/reanalyze/{recording_id}` (ana/app/routers/conversations.py:357) и `python -m worker.reanalyze` (ana/worker/reanalyze.py).

## Пример структуры (обезличен)
```
recordings: source=mobile status=analyzed audio_path=voiceiq-recordings/<org>/<store>/<seller>/2026-10-16/<id>.webm
transcript_segments: [{segment_index:0, speaker_role:"seller", speaker_id:0, text:"Сәлеметсіз бе, ...", start_ms:0, end_ms:2100}, ...]
conversations: outcome="purchase" overall_score=72.5 offers_count=1 offers_accepted=0 talk_ratio=0.61
```
