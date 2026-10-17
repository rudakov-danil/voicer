> Обновление снимка 17.10.2026: основной репозиторий этой копии — `rudakov-danil/voicer`, ветка `main`. Полные исходники текущего фронтенда восстановлены из опубликованного релиза и успешно собираются. Ниже сохранена серверная памятка, составленная до релиза клиник; сведения о старом репозитории и недостающих исходниках исторические. Актуальный состав и проверки: [docs/server-snapshot-2026-10-17.md](docs/server-snapshot-2026-10-17.md).

# VoiceIQ (Voicer) — памятка для Claude Code

Дата проверки фактов: 2026-10-17 (сервер в UTC). Подробности — папка [`docs/`](docs/README.md).

## Сначала
1. **Данные подключения** (ssh-алиас и адрес сервера, ключ, путь к ssh на ПК, пути к копиям проекта на ПК, аккаунт GitHub) — в `.local/connection.md`. Файл локальный: он в `.gitignore`, на сервер и в git не попадает. Если файла нет или в нём не хватает нужного:
   - поискать на ПК: `~/.ssh/config` (Host, HostName, IdentityFile), `~/.ssh/*`, `git config --global user.name`, `~/.git-credentials` (только имя пользователя, токен не выводить), где лежит `ssh.exe`, где лежит копия проекта;
   - чего не нашлось — спросить у пользователя;
   - записать в `.local/connection.md` по шаблону из раздела «Локальные файлы и одноразовые скрипты». Пароли и токены туда не записывать.
2. Прочитать этот файл целиком, затем нужный файл из `docs/` — оглавление в [`docs/README.md`](docs/README.md).

## Продукт
- Речевая аналитика разговоров продавцов, бариста и фармацевтов (кофейни, аптеки, розница, телефонные продажи; есть Казахстан: ru/kk вперемешку).
- Запись (бейдж, телефон сотрудника, ручная загрузка, телефония, готовый текст) → распознавание речи → роли «продавец/клиент» → LLM-оценка по скриптам, допродажи, возражения, спрос, комплаенс → кабинет руководителя (`lk.voicer-ai.pro`, витрины `horeca.` и `pharma.voicer-ai.pro`) и приложение сотрудника (`mobile.voicer-ai.pro`). Организациями управляет консоль техадмина (`docs/super-admin.md`).
- Это тестовый сервер пользователя, но на нём живые демо-организации (horeca/pharma/lk). Всё, что ломает вход или анализ, видно сразу.

## О пользователе и этом файле
- Пользователь — владелец и разработчик VoiceIQ, пишет по-русски. Тестирует сервис на своём сервере и показывает демо (кофейни и аптеки, в том числе в Казахстане). Работает с Windows-машины. Пароли вводит сам в своём терминале. Решения о том, что менять на сервере, принимает он.
- Этот файл пользователь называет «твой файл» или «файл сервиса» (раньше это был отдельный `VOICEIQ_CONTEXT.md`, 2026-10-17 он объединён с `CLAUDE.md`). «Запиши в твой файл / в файл сервиса» значит дописать сюда или в подходящий файл `docs/` (если это подробности), а не заводить новый документ.
- Файл пользователь присылает в новый диалог, чтобы ты сразу понял контекст. Если доступа к коду и серверу нет, всё ниже — снимок на 2026-10-17. Если нужен файл из `docs/`, а его не прислали, попроси его, а не угадывай.
- Файл и `docs/` лежат в трёх местах: на сервере (`~/voiceiq`), в локальной копии проекта на ПК и в git. Править в локальной копии и выкладывать на сервер (с бэкапом), не допуская расхождений.

## Хронология (UTC)
- 2026-10-14: релизы мотивации («монеты»), «без цен» в приложении, демо кофейни; первая горячая правка фронтенда -ph1014.
- 2026-10-15: смысловая нарезка записей.
- 2026-10-16:
  - ручная и мобильная загрузка режется на разговоры;
  - казахский язык в промптах (LANGUAGE_NOTE);
  - для Deepgram сделан режим auto-ru-kk, потом для теста жёстко прописан kk;
  - DOMAIN_ORGS переключали на CoffeeDemo, в тот же день вернули;
  - создана организация CoffeeDemo (coffee-demo, KZT, Asia/Almaty);
  - фронтенд: даты по местному времени (-tz1017), исправлена автопрокрутка расшифровки (-sc1017);
  - пароль в форме «Пользователи системы» теперь сохраняется;
  - распознавание переключено на ElevenLabs Scribe v2 через OpenRouter.
- 2026-10-17 05:42–06:32: выкачены релизы horeca-fix (исходы, -np1017) и horeca-context (отсев «не гостей» в кофейнях) — не в сессиях Claude, а с машины, где собирают релизы.
- 2026-10-17 днём: написана документация (`docs/`).
- 2026-10-17 вечером (сессия Claude):
  - локальный git-репозиторий на ПК, выгрузка на GitHub: ветки `backup-*` и `master` (`docs/operations.md`, «Git»);
  - консоль технического администратора в auth-service (15:37);
  - 15:42 ВМ выключили со стороны облака, 15:44 загрузилась;
  - повтор подключения к RabbitMQ в API-сервисах (16:07);
  - документация собрана в одну папку `docs/`, `CLAUDE.md` объединён с `VOICEIQ_CONTEXT.md`, удалён `MVP_PLAN.md` (остатки — бэклог в `docs/known-issues.md`).

## Что временно или ждёт решения
- Тестовый жёсткий `kk` в Deepgram (вернуть auto-ru-kk или оставить) и `STT_LANGUAGE=kk`, из-за которого язык в транскриптах всегда kk.
- **Отложено пользователем (без отдельной просьбы не исправлять):**
  - полные исходники фронтенда: в `src` нет `ConversationPage.tsx`, `DemandPage.tsx`, `pages/Home*`, пользователю обещали их выложить (`docs/known-issues.md` №43). Когда появятся — внести правку `-sc1017` по `services/frontend/HOTFIXES.md`;
  - изоляция организаций (№36–41) и открытые без авторизации внутренние ручки recorder (№17, №38).
- Падающий юнит-тест анализа (№42) — обновить тест под новое поведение.

## Подключение и сервер
- Как подключаться — `.local/connection.md`. На ПК пользователя PATH сломан: ssh и scp вызывать по полному пути оттуда. Многострочные команды — через Bash-инструмент и heredoc:
```bash
<SSH> -o BatchMode=yes <SERVER> 'bash -s' <<'EOF'
cd ~/voiceiq && docker compose ps
EOF
```
- Проект `~/voiceiq` — **не git**. Копия для git — на ПК; по просьбе пользователя выгружается на GitHub `Freezy113/voiceiq`: в ветки `backup-<дата>-<время>` (с `dist`) и в `master` (без `dist`). Порядок — `docs/operations.md` («Git»).
- Compose: `docker-compose.yml` + `docker-compose.override.yml` (override закрывает порты наружу, nginx только на `127.0.0.1:8080`).
- Postgres: `docker exec -i voiceiq-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
- Релизы приходят копиями с macOS (файлы `._*`), полный исходник фронтенда — только на той машине. Правки на сервере нужно повторить там же, иначе следующий релиз их затрёт.

## Карта сервисов (порт внутри сети compose)
| Контейнер | Код (папка сборки) | Порт | Назначение |
|---|---|---|---|
| nginx | образ nginx + `nginx/nginx.conf`, `services/frontend/dist` | 80 → 127.0.0.1:8080 | шлюз `/api/v1/<svc>/`, раздача SPA |
| auth-service | services/auth-service | 8001 | вход, JWT, пользователи, витрины по домену, мобильные приглашения, консоль техадмина |
| admin-service | services/admin-service | 8007 | магазины, продавцы, бейджи, настройки приватности |
| recorder-service | services/recorder-service | 8002 | приём аудио (ручное, мобильное, бейдж, телефония), STT для ручных/мобильных/звонков; внутри ещё слушает queue.stitch и опрашивает мобильную очередь |
| recorder-worker | services/recorder-service | — | `worker.stitch_worker` (queue.stitch) |
| transcription-service | services/transcription-service | 8003 | транскрипты, готовый текст, `/internal/segment-conversations`; внутри слушает queue.transcribe_full |
| transcription-worker | services/transcription-service | — | `worker.transcribe_worker` (queue.transcribe_full, бейдж) |
| diarize-worker | services/transcription-service | — | `worker.diarize_worker` (queue.diarize): роли по LLM и голосовым отпечаткам (ECAPA) |
| analytics-engine | services/analytics-engine | 8004 | API резюме и советов; внутри тоже слушает queue.analyze |
| analytics-worker | services/analytics-engine | — | `worker.analyze_worker` (queue.analyze): весь LLM-анализ |
| scripts-service | services/scripts-service | 8005 | скрипты, правила допродаж и комплаенса, библиотека, импорт документов |
| dashboard-service | services/dashboard-service | 8006 | все графики и списки кабинета, монеты, спрос; Redis-кэш; внутри слушает queue.cache.invalidate |
| dashboard-worker | services/dashboard-service | — | `worker.cache_invalidation_worker` |
| postgres / redis / rabbitmq / minio | образы | — | БД (6 схем), кэш, очереди, аудио |

Не запущены, хотя описаны в compose: prometheus, node-exporter, grafana. Чужие проекты на том же хосте: `voiceagent-*`, `founder-cabinet` (sultansho.voicer-ai.pro) — не трогать.

## Путь записи (подробно: docs/pipeline.md)
```
manual  POST /recorder/upload ─► MinIO voiceiq-recordings + recordings(processing) ─► BackgroundTask: STT ─► [split на разговоры] ─┐
mobile  POST /recorder/mobile/upload ─► recordings(mobile_queued) ─► опрос раз в 5 с ─► mobile_processing ─► тот же код, что manual ─┤
                                                                                         transcripts(transcribed) ─► queue.diarize ─┤
badge   POST /recorder/chunks (+ /finalize) ─► queue.stitch ─► full_day.wav ─► queue.transcribe_full ─► STT + LLM-сегментация ─►    │
        N записей (segmented) + transcripts ─► queue.diarize ──────────────────────────────────────────────────────────────────────┤
call mono   /recorder/telephony/calls | /webhook/{token} ─► BackgroundTask: STT ─► queue.diarize ──────────────────────────────────┤
call stereo то же, Deepgram multichannel, роли по каналам, transcripts(diarized) ─► queue.analyze ─────────────────────┐            │
transcript  POST /transcription/upload-transcript ─► recordings(source=transcript) + transcripts(diarized) ─► queue.analyze ─┤       │
                                                                     diarize-worker: роли ─► transcripts(diarized) ─► queue.analyze ◄┘
analyze-worker: [фильтр кофеен] ─► скрипты ─► общий анализ+комплаенс ─► допродажи ─► analytics.conversations, recordings(analyzed)
                ─► queue.cache.invalidate ─► dashboard-worker чистит Redis
```

## Главные правила и ловушки
1. Без явного согласия пользователя только чтение. Перед любой правкой — копия в `~/voiceiq-backups/<тема>-YYYYMMDD-HHMMSS/` с теми же относительными путями.
2. Секреты: `.env` целиком не выводить. Смотреть имена так: `sed -E 's/=.*/=***/' .env`. Безопасные значения (STT_PROVIDER, LLM_MODEL_NAME) — точечным `grep '^ИМЯ='`. Секретный адрес консоли техадмина (`SUPER_CONSOLE_PATH`) в файлы не писать.
3. После `docker compose up -d` любого сервиса **сразу** `docker compose exec nginx nginx -s reload`: upstream'ы в `nginx/nginx.conf:1-7` резолвятся при старте nginx, новый IP контейнера = 502.
4. Только `docker compose up -d --no-deps <сервисы>`. Голый `docker compose up -d` поднимет prometheus/grafana/node-exporter (порты 9090/3001 в базовом compose) и пересоздаст всё подряд.
5. Никогда не запускать `deploy.sh` (делает `git pull`, на сервере нет git) и `start.sh` (делает `npm run build` из неполного `src` и затрёт рабочий `dist`).
6. Один код — несколько контейнеров. Пересобирать и перезапускать группой: `recorder-service recorder-worker`; `transcription-service transcription-worker diarize-worker`; `analytics-engine analytics-worker`; `dashboard-service dashboard-worker`. Очереди stitch/transcribe_full/analyze/cache.invalidate слушают **два** процесса (API и воркер), и сообщение уйдёт в любой из них.
7. Перед перезапуском воркеров очереди должны быть пусты: `docker exec voiceiq-rabbitmq-1 rabbitmqctl list_queues -q name messages messages_unacknowledged consumers`. Ручная загрузка и звонки обрабатываются в BackgroundTasks внутри recorder-service, поэтому перезапуск посреди обработки теряет запись (она остаётся в `processing`).
8. `docker compose run -T` и `docker compose exec` внутри ssh-heredoc съедают stdin: всегда дописывать `</dev/null`.
9. Модель (сейчас `deepseek/deepseek-v4.1-flash` через OpenRouter) оборачивает JSON в ```json. Любой новый парсер ответа LLM должен снимать обёртку (образец: services/transcription-service/app/diarization.py:191).
10. ТЕСТОВЫЙ режим STT с 2026-10-17: `_listen` в обоих `deepgram_client.py` жёстко шлёт `language=kk` (recorder:55, transcription:54), блок auto-ru-kk закомментирован ниже. Основной STT сейчас `STT_PROVIDER=openrouter` (ElevenLabs Scribe v2, `STT_LANGUAGE=kk`), Deepgram используется только для стерео-телефонии и тоже идёт с kk.
11. Ко всем запросам LLM в analytics-engine и transcription-service автоматически добавляется `LANGUAGE_NOTE` про казахский язык (`app/llm_client.py:34`). В scripts-service этой добавки нет.
12. Фронтенд на сервере не собирается: `services/frontend/src` неполный, рабочий `dist` привезён собранным. Правки делаются только горячими патчами с новым суффиксом файлов (`docs/frontend.md`). JS кэшируется браузером на год.
13. Время: контейнеры работают в UTC, `date.today()` в коде — дата по UTC. Для Казахстана (UTC+5) с 00:00 до 05:00 по местному времени дата смены получается вчерашней.
14. Расшифровки — персональные данные. В отчётах не больше пары примеров структуры, без имён и телефонов.
15. В Windows-терминале пароль пользователь вводит сам: вход на публичный сайт, `reset_password.sh`, `create_super_admin.py`, создание организаций через getpass. Не просить пароли в чате.
16. Git и GitHub — только по просьбе пользователя. Репозиторий был публичным: ничего локального (`.local/`), секретов и `.env` не выгружать.

## Локальные файлы и одноразовые скрипты
- `.local/` в корне проекта — локальная папка разработчика, в `.gitignore`, на сервер не выкладывается. При синхронизации сервер → ПК её не стирать (`docs/operations.md`, «Git»).
  - `.local/connection.md` — данные подключения. Шаблон:
```markdown
# Подключение (локально, не коммитить)
- SERVER (ssh-алиас): …        адрес: …        пользователь: …
- Ключ: ~/.ssh/…
- SSH на ПК: полный путь к ssh.exe / scp.exe (в Bash: /c/Windows/System32/OpenSSH/ssh.exe)
- PC_REPO (копия проекта на ПК): …        папка сессий Claude: …
- GitHub: репозиторий Freezy113/voiceiq, аккаунт …, доступ (HTTPS credential store / ssh-ключ)
- Прочее: путь к upload_record.ps1, email техадмина и т.п. (без паролей)
```
  - `.local/scratch/` — **одноразовые служебные скрипты** (правка документации, разовые миграции данных, проверки). Не класть их рядом с исходниками в `services/` и не коммитить. После того как скрипт отработал и больше не нужен — удалить. Если нужно запустить скрипт на сервере — копировать во временный `/tmp/...` на сервере или в контейнере и удалять после запуска (`docs/operations.md`, «Разовые скрипты»).
- Многоразовые проверки, которые стоит хранить, кладутся в `tests/` сервиса (пример — `services/auth-service/tests/manual_super_admin_check.py`).

## Где менять X
| Задача | Файл |
|---|---|
| язык, провайдер, модель STT | `.env` STT_PROVIDER/STT_LANGUAGE/STT_MODEL/DEEPGRAM_LANGUAGE + обе копии `app/deepgram_client.py` и `app/openrouter_stt.py` (recorder и transcription, должны совпадать) |
| нарезка ручной/мобильной загрузки на разговоры | services/recorder-service/app/conversation_split.py, SPLIT_MANUAL_UPLOADS в app/config.py:32; промпт границ — services/transcription-service/app/diarization.py:129 |
| роли продавец/клиент | services/transcription-service/app/diarization.py (промпты :32, :394), worker/diarize_worker.py, app/voice_check.py |
| промпты анализа | services/analytics-engine/app/prompt_builder.py (отрасли — INDUSTRY_CONTEXT :627), парсеры — app/response_parser.py |
| шаги анализа и поля conversations | services/analytics-engine/worker/analyze_worker.py:818 |
| отсев «не гость» в кофейнях | services/analytics-engine/app/context_filter.py + services/recorder-service/app/routers/context.py |
| домены-витрины | services/auth-service/app/config.py:17 (DOMAIN_ORGS, DOMAIN_ORG_GUESTS) + host-nginx `/etc/nginx/sites-enabled/` |
| права ролей в записях | services/recorder-service/app/routers/recordings.py:20, mobile.py:34 |
| графики и списки кабинета | services/dashboard-service/app/routers/*.py |
| мобильное приложение | services/mobile → публикация в /var/www/voicer-mobile/releases/<дата>/ (`docs/frontend.md`) |
| повторный анализ | `docker compose exec -T -w /app analytics-engine python -m worker.reanalyze <recording_id>` |
| консоль техадмина | services/auth-service/app/routers/super_admin.py + app/static/super_console.html (`docs/super-admin.md`) |
| слушатели очередей в API-сервисах | `app/main.py` recorder, transcription, analytics, dashboard (`_consume_forever`) |

## Документация — `docs/`
Оглавление — [`docs/README.md`](docs/README.md).
- Технические файлы (как устроено сейчас): `architecture.md`, `pipeline.md`, `database.md`, `auth-and-roles.md`, `super-admin.md`, `frontend.md`, `operations.md` (выкатка, откат, бэкапы, git), `known-issues.md` (проблемы и бэклог).
- `docs/product/` — исходный замысел продукта (март–май 2026): анализ, скрипты, метрики, экраны, ТЗ фронтенда, бейдж, телефония, MANGO, мотивация, 152-ФЗ. **Часто не нужен**: открывать, когда нужен замысел, описание экрана или интеграции, текст для клиента. В каждом файле блок «Актуальность (2026-10-17)»; если он противоречит тексту ниже, верен блок.
- `docs/services/` — описания сервисов с кодом на май 2026, только для обзора.
- При заметных изменениях дописывать в нужный технический файл; в продуктовом — строку в блок «Актуальность».
