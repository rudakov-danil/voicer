# Эксплуатация: как безопасно менять и выкатывать

Проверено 2026-10-17. Все команды выполняются на сервере в `~/voiceiq` (через ssh-heredoc, см. CLAUDE.md). Любая запись (правка файлов, сборка, перезапуск, SQL кроме SELECT, RabbitMQ, MinIO) — только с согласия пользователя.

## Порядок выкатки изменения в Python-сервис
```bash
cd ~/voiceiq
# 1. бэкап исходных файлов с относительными путями
B=~/voiceiq-backups/<тема>-$(date -u +%Y%m%d-%H%M%S); mkdir -p $B
cp --parents services/analytics-engine/app/prompt_builder.py $B/
# 2. правка (Edit через scp или sed/python на сервере)
# 3. сборка всей группы, использующей этот код
docker compose build analytics-engine analytics-worker
# 4. тесты на новом образе (код попадает в образ через COPY . ., поэтому сначала build)
docker compose run --rm --no-deps -T analytics-worker python -m pytest tests/test_prompt_builder.py -q </dev/null
# 5. очереди пусты и нет записей в работе
docker exec voiceiq-rabbitmq-1 rabbitmqctl list_queues -q name messages messages_unacknowledged consumers
# 6. перезапуск только нужных сервисов
docker compose up -d --no-deps analytics-engine analytics-worker
# 7. сразу, иначе 502
docker compose exec -T nginx nginx -s reload
# 8. проверка
docker compose ps; docker logs --tail 30 voiceiq-analytics-worker-1
```
Группы, собираемые вместе: `recorder-service recorder-worker` · `transcription-service transcription-worker diarize-worker` · `analytics-engine analytics-worker` · `dashboard-service dashboard-worker`. auth, admin, scripts — по одному.

Перед п. 6 проверить, что нет «висящих» записей: ручная загрузка и звонки обрабатываются в BackgroundTasks процесса recorder-service, мобильные — его же циклом. Признак работы — свежие строки `recordings` со статусами `processing`/`mobile_processing` (SELECT) или строки `OpenRouter STT` / `Published to queue` в `docker logs voiceiq-recorder-service-1`. Перезапуск посреди обработки оставляет `processing` навсегда (мобильные подхватятся заново, ручные — нет).

Миграции: `docker compose run --rm --no-deps -T <svc> alembic upgrade head </dev/null` (после сборки, до up). Откат — `alembic downgrade -1`; сначала посмотреть `downgrade()` в файле миграции.

## Откат
- Код: скопировать файлы из `~/voiceiq-backups/<тема>-<время>/` обратно, затем шаги 3–7.
- `.env`: копии `.env.bak-*` в `~/voiceiq`; после правки `.env` нужен `up -d --no-deps` (пересоздание, не `restart`) нужных сервисов и reload nginx.
- STT: `STT_PROVIDER=deepgram` в `.env` → пересоздать recorder-service, transcription-service, transcription-worker.
- Фронтенд: `index.html` из `dist/index.html.before-*` (frontend.md).

## Существующие бэкапы (~/voiceiq-backups)
| Папка | Что было до правки |
|---|---|
| split-20261016-164122 | до разбиения ручной загрузки на разговоры |
| kazakh-20261016-172217 | до LANGUAGE_NOTE и казахских маркеров |
| lang-auto-20261016-174257 | до режима DEEPGRAM_LANGUAGE=auto-ru-kk |
| domain-20261016-182246 | до правки DOMAIN_ORGS |
| kk-hardcode-20261016-191934 | до жёсткого `language=kk` в `_listen` |
| frontend-dates-20261016-193327 | до горячей правки -tz1017 |
| user-password-20261016-200346 | до приёма пароля в PATCH users |
| stt-openrouter-20261016-201141 | до переключения STT на OpenRouter |
| superadmin-20261017-153553 | до консоли техадмина: весь services/auth-service, docker-compose.yml, `.env` (600) |
| rabbit-reconnect-20261017-160536 | до повтора подключения к RabbitMQ: `app/main.py` recorder, transcription, analytics, dashboard |
| documentation-20261017-164535 | до обновления `documentation/` (блоки «Актуальность», переписанные README, infrastructure, super-admin) |
Релизы, выкаченные 2026-10-17 05:42–06:32 UTC (horeca-fix, horeca-context), отдельных бэкапов в `~/voiceiq-backups` не имеют; их файлы лежат в `~/horeca-fix-20261017/` и `~/horeca-context-20261017/` (там же `baseline_hashes.json` — sha256 файлов, видимо, до выкатки; не проверено). Бэкапы релизов, сделанных не в сессиях Claude (08–17.10), и дампы БД лежат в `~/deploy-backups/` (architecture.md, «Прочие файлы»).

## После перезагрузки сервера
Контейнеры поднимаются сами (`restart: unless-stopped`). Проверить: `docker compose ps` (воркеры могут несколько раз перезапуститься, пока стартует RabbitMQ), очереди — consumers по 2 у stitch/transcribe_full/analyze/cache.invalidate и 1 у diarize, `https://lk.voicer-ai.pro/login` → 200. 2026-10-17 15:42 UTC ВМ выключали кнопкой питания со стороны облака (не unattended-upgrades: `Automatic-Reboot` выключен).

## Git: сервер → ПК → GitHub
Подстановки `<PC_REPO>` (локальная копия проекта на ПК), `<SSH>` (команда ssh на ПК), `<SERVER>` (ssh-алиас сервера) и аккаунт GitHub — в `.local/connection.md`.

Настроено 2026-10-17. На сервере git не подключён (`~/voiceiq` без `.git`, у сервера нет ключа к GitHub), поэтому код выгружается в два шага: сначала копия на ПК пользователя, оттуда push на GitHub.

### Что где
| Что | Где |
|---|---|
| Локальный репозиторий | `<PC_REPO>` , ветка `main` |
| Удалённый репозиторий | `origin` = `https://github.com/Freezy113/voiceiq.git`. Репозиторий **публичный** (на 2026-10-17; пользователь собирается его закрыть) |
| Доступ | HTTPS, сохранённые данные аккаунта из `.local/connection.md` (`credential.helper=store`, файл `~/.git-credentials`; не выводить). SSH-ключа к GitHub нет, `gh` не установлен |
| Время | на ПК UTC+5, на сервере UTC. Названия веток и коммитов — по времени ПК |
| Первая выгрузка | ветка `backup-20261017-201712`, коммит `6aea05c` («Снимок ~/voiceiq с сервера voicer на 2026-10-17»). Её история не связана с `master`/`dev`: diff с ними сделать можно, PR в `master` нельзя |

### Порядок выгрузки
Выгружать, когда пользователь просит (например, после правок на сервере). Каждая выгрузка — новая ветка `backup-<ДАТА>-<ВРЕМЯ>`, в существующие ветки (`master`, `dev`, `nikita-dev` и др.) не пушить, `--force` не использовать.

```bash
cd <PC_REPO>
# 1. убрать старые файлы (кроме .git и .local), чтобы удалённые на сервере файлы тоже ушли из снимка
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .local -exec rm -rf {} +
# 2. скачать ~/voiceiq без секретов и мусора
<SSH> -o BatchMode=yes <SERVER> 'cd ~/voiceiq && tar -czf - --exclude=./.env --exclude="./.env.bak*" --exclude="*.env.bak*" --exclude="._*" --exclude=__pycache__ --exclude="*.pyc" --exclude=node_modules --exclude=.DS_Store .' > ../voiceiq-snapshot.tgz
tar -xzf ../voiceiq-snapshot.tgz && rm ../voiceiq-snapshot.tgz
# 3. в .env.example на сервере лежит настоящий пароль администратора — заменить заглушкой
sed -i -E 's/^(BOOTSTRAP_ADMIN_PASSWORD=).*/\1ЗАМЕНИТЕ_НА_ПАРОЛЬ/' .env.example
# 4. проверить секреты: файлов .env/ключей быть не должно, подозрительные строки разобрать вручную
git ls-files -o --exclude-standard | grep -E '(^|/)\.env$|\.env\.bak|id_rsa|\.pem$|\.key$'
grep -rIlE '(sk-or-[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)' --exclude-dir=.git .
# 5. добавить всё; dist в .gitignore, поэтому принудительно (в нём горячие правки, это единственная копия)
git add -A && git add -f services/frontend/dist
git diff --cached --stat
# 6. коммит (см. правила ниже)
git commit -F /путь/к/сообщению.txt
# 7. новая ветка и push
B="backup-$(date +%Y%m%d-%H%M%S)"; git branch "$B"
GIT_TERMINAL_PROMPT=0 git push origin "refs/heads/$B:refs/heads/$B"
# 8. проверка: хэш на GitHub = локальный
GIT_TERMINAL_PROMPT=0 git ls-remote origin "refs/heads/$B"; git rev-parse HEAD
```
- Если `git diff --cached --stat` пуст — изменений нет: коммит и ветку не создавать, сказать пользователю.
- Локальная исключалка `.git/info/exclude` уже содержит `.env`, `.env.*` (кроме `.env.example`) и `._*`.
- Если push просит пароль или отвечает 403 — не вводить ничего, сообщить пользователю (сохранённый токен устарел или отозван).
- Если сервер недоступен или скачивание оборвалось после шага 1 — вернуть файлы `git checkout -- . && git clean -fd` (в папке ничего, кроме снимка, нет), не выгружать старое состояние под новым именем, сообщить пользователю.

### Основная ветка master
С 2026-10-17 в `master` лежит код сервера (коммит `0600cdc` «Код сервера voicer на 2026-10-17 (без собранного dist)» поверх `8e8a849`, обычный fast-forward, без force). До этого `master` не обновлялся с 2026-05-15.
- Ветки `backup-*` — полные снимки вместе с `dist`, их история **не связана** с `master`. В `master` кладётся то же содержимое, но **без `services/frontend/dist`**: так решил пользователь, собранный фронтенд в git не нужен.
- Локально: ветка `main` — снимки сервера (для `backup-*`), ветка `master-update` следит за `origin/master`.
- Перенос очередного состояния сервера в `master` (после шагов 1–6 из «Порядка выгрузки», в ветке `main`):
```bash
cd <PC_REPO>
GIT_TERMINAL_PROMPT=0 git fetch origin master
git checkout master-update && git merge --ff-only origin/master   # если не fast-forward — кто-то пушил в master: смотреть, что там, и спросить пользователя
git rm -r -q .                                                   # убрать всё отслеживаемое, чтобы удалённые на сервере файлы ушли и из master (.local/ и dist не отслеживаются и не трогаются)
git checkout main -- . ':!services/frontend/dist'                 # содержимое снимка без dist
git diff --cached --stat                                         # описать изменения в коммите по правилам ниже
git commit -F <сообщение> && GIT_TERMINAL_PROMPT=0 git push origin HEAD:refs/heads/master
git checkout main
```
- `services/frontend/HOTFIXES.md` (есть и на сервере, и в `master`) — какие горячие правки dist уже в `src` (`-tz1017`, `-np1017`), а какую нужно перенести вручную (`-sc1017`, автопрокрутка в `pages/ConversationPage.tsx`). Файлов `ConversationPage.tsx`, `DemandPage.tsx`, `pages/Home*` нет ни на сервере, ни на GitHub, поэтому фронтенд из `src` не соберётся, пока их не добавит тот, у кого есть полные исходники.
- Пушить в `master` — только по просьбе пользователя: в репозитории работают и другие люди (Danil, Dmitry).

### Названия веток и коммитов
- Ветка: `backup-ГГГГММДД-ЧЧММСС` по времени ПК, например `backup-20261017-201712`.
- Заголовок коммита (первая строка): `Снимок сервера ГГГГ-ММ-ДД ЧЧ:ММ: <кратко что изменилось>`, например `Снимок сервера 2026-10-18 14:05: фильтр кофеен, горячая правка -xx1018`. Не длиннее ~100 символов.
- Тело коммита — **описание изменений**, если его удаётся составить: по `git diff --cached --stat` и самим диффам, сгруппировать по сервисам (`analytics-engine: …`, `frontend dist: новая горячая правка -xx1018`, `.env.example: …`). Что поменялось и зачем, если это известно из сессии; без персональных данных и секретов.
- Последняя строка тела: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (или актуальная подпись из системного напоминания).
- **Если описать изменения не получается** (слишком большой дифф, только минифицированный dist или бинарные файлы, непонятно, что и зачем менялось): **уведомить пользователя**, что описания нет и почему, **не сочинять** описание, но всё равно выгрузить. Тогда заголовок `Снимок сервера ГГГГ-ММ-ДД ЧЧ:ММ: без описания изменений`, в теле — только вывод `git diff --cached --stat` (список файлов) и подпись.

## Разовые скрипты внутри контейнера
```bash
# скопировать скрипт в контейнер и запустить с кодом сервиса
docker compose cp /tmp/x.py analytics-engine:/tmp/x.py
docker compose exec -T -w /app -e PYTHONPATH=/app analytics-engine python /tmp/x.py
# повторный анализ
docker compose exec -T -w /app analytics-engine python -m worker.reanalyze --latest 1 --wait 300
```
Скрипты, которые пишут в БД или очереди, — только с согласия пользователя. Пароли — только через `getpass` в терминале пользователя (например `reset_password.sh`).

## Тесты
- Запуск: `docker compose run --rm --no-deps -T <svc> python -m pytest tests/<файл> -q </dev/null`. Без `</dev/null` в heredoc команда съест остаток скрипта.
- pytest 8.2, pytest-asyncio 0.23 (`asyncio_mode = auto` в pytest.ini у analytics/dashboard/scripts).
- Фикстуры БД в `tests/conftest.py` всех сервисов поднимают `testcontainers.postgres.PostgresContainer`. В compose-контейнеры docker.sock не пробрасывается, поэтому тесты с БД внутри `docker compose run`, скорее всего, не работают (не проверено; заметки прошлой сессии: в auth-service падают даже старые тесты — «event-loop fixture», вероятно, та же причина). Чистые юнит-тесты (парсеры, промпты, нарезка) работают.
- Падали до правок прошлых сессий: `transcription-service/tests/test_diarization.py` — 3 теста (2026-10-16); `analytics-engine/tests/test_response_parser.py::test_parse_general_analysis_invalid_outcome` — код теперь превращает неизвестный исход в `unknown`, тест ждёт исключение (known-issues №42).
- Пропущены намеренно: `tests/test_language_choice.py` в recorder и transcription (module-level `pytestmark` skip, пока `_listen` жёстко шлёт kk).
- Тесты сегодняшних релизов (`test_context_filter.py`, `test_step_identity.py`, `test_retail_outcomes.py`) в `services/analytics-engine/tests/` не скопированы; они лежат в `~/horeca-context-20261017/services/analytics-engine/tests/` и `~/horeca-fix-20261017/horeca-regression/`.
- Полезные юнит-тесты: recorder `test_conversation_split.py`, `test_openrouter_stt.py`, `test_deepgram_parsing.py`, `test_telephony_parsing.py`; transcription `test_segmentation_endpoint.py`, `test_language_note.py`, `test_voice_check.py`; analytics `test_response_parser.py`, `test_prompt_builder.py`, `test_language_note.py`.

## Диагностика (чтение)
```bash
docker compose ps
docker logs --since 1h voiceiq-analytics-worker-1 | grep -E 'LLM usage|Analyzed|Filtered|failed'
docker logs --since 1h voiceiq-recorder-service-1 | grep -E 'OpenRouter STT|Deepgram|split|Published'
docker logs --since 1h voiceiq-diarize-worker-1 | grep -E 'strategy|Speaker roles|Diarized'
docker exec voiceiq-rabbitmq-1 rabbitmqctl list_queues -q name messages messages_unacknowledged consumers
docker compose config --services
```
Логи пишутся только с момента пересоздания контейнера (`docker logs` не переживает `up -d`).

## Ловушки
| Ловушка | Что делать |
|---|---|
| 502 после `up -d` | `docker compose exec -T nginx nginx -s reload` |
| `docker compose up -d` без имён | поднимет prometheus/grafana/node-exporter (не запущены, base compose публикует 9090/3001; у grafana пароль по умолчанию `admin`, если GRAFANA_PASSWORD пуст) и пересоздаст всё |
| `deploy.sh`, `start.sh` | не запускать (git pull / npm build) |
| `docker compose restart` после правки `.env` | не подхватит новые переменные — нужен `up -d --no-deps` |
| правка кода без пересборки | контейнеры работают из образа (код не смонтирован), правка в `services/` без build ничего не меняет |
| сборка одного контейнера из группы | второй процесс, слушающий ту же очередь, останется на старом коде |
| `docker compose run` без `--no-deps` | поднимет зависимости и может пересоздать postgres/rabbitmq |
| старые образы | каждая сборка оставляет предыдущий образ (`docker images | grep voiceiq`); удаление — только с согласия |
| время | контейнеры и сервер в UTC; пользователь в Казахстане (UTC+5) |
| чужие проекты на хосте | `voiceagent-*`, `founder-cabinet-*`, сайт sultansho — не трогать |
