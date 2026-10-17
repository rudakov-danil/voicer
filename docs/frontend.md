# Фронтенд кабинета и мобильное приложение

Проверено на сервере 2026-10-17 13:40 UTC; сверка горячих правок с `src` — 2026-10-17 вечером.

## Кабинет (React + Vite + TypeScript, react-query, zustand)
- Раздаёт compose-nginx: bind-mount `~/voiceiq/services/frontend/dist` → `/usr/share/nginx/html` (read-only). Контейнер nginx перезапускать для обновления dist не нужно: файлы читаются с диска.
- `services/frontend/src` на сервере **неполный**: `App.tsx` ссылается на страницы, которых нет (`ConversationPage`, `DemandPage`, `Home` грузятся lazy-импортом), рядом лежат старые `.js`-копии. Собирать здесь нельзя (`npm run build` и `start.sh` затрут рабочий dist). Рабочий dist собран в репозитории пользователя и привезён целиком; утренние релизы 2026-10-17 привозили отдельные `src`-файлы (outcomes.ts, OutcomeTag.tsx, ConversationsPage.tsx, types/index.ts) только для истории.
- Кэш: `*.js`/`*.css` отдаются с `expires 1y` и `immutable`, `*.html` — `no-cache`. Поменять содержимое существующего JS бесполезно: браузеры его не перезапросят. Новый код = новое имя файла + новый `index.html`.
- В `dist/assets` 809 файлов: 629 исходных с хэшами Vite (несколько поколений релизов) и по 45 файлов на каждую горячую правку.

### Маршруты (из App.tsx и бандла)
`/login`; внутри `ProtectedRoute` + `AppLayout`: `/` (Home), `/dashboard`, `/conversations`, `/conversations/:id` (ConversationPage — расшифровка с плеером), `/team`, `/upsells`, `/motivation` (монеты и приглашения в приложение), `/scripts`, `/analytics`, `/demand`, `/compliance`, `/settings`, `/admin`; `/intelligence` и `/training` перенаправляют на `/dashboard`.
API-клиенты лежат в `src/api/*.ts` (axios, `/api/v1/...`), справочник исходов — `src/lib/outcomes.ts`, даты — `src/lib/dates.ts`.

### Цепочка горячих правок
| Суффикс | Когда (UTC) | Что | Откат |
|---|---|---|---|
| (база) | ≤ 2026-10-14 | последний полный релиз | — |
| `-ph1014` | 2026-10-14 07:46 | правка прошлой сессии | `dist/index.html.before-tz1017` (указывает на `index-Ctt-g7ou-ph1014.js`) |
| `-tz1017` | 2026-10-16 19:38 | даты по местному времени вместо `toISOString()` (UTC) | `dist/index.html.before-sc1017` (указывает на `-tz1017`) |
| `-sc1017` | 2026-10-16 20:19 | автопрокрутка расшифровки в ConversationPage: `offsetTop` внутри `position:relative` прыгала наверх, заменено на `getBoundingClientRect` + `scrollTop` | файла `before-np1017` нет: вернуть в `dist/index.html` ссылку на `/assets/index-Ctt-g7ou-sc1017.js` |
| `-sc1017-np1017` | 2026-10-17 05:44, index.html 06:09 | релиз horeca-outcome (единый справочник исходов ритейла и телефонии); привезён готовым из `~/horeca-fix-20261017/horeca-outcome-release/assets/` | см. строку выше |
Сейчас `dist/index.html` грузит `/assets/index-Ctt-g7ou-sc1017-np1017.js` и `/assets/index-BPLtX1iW.css`, favicon `?v=20261017-mobile`. Что из горячих правок уже есть в `src` (проверено 2026-10-17): `-tz1017` — да (`src/lib/dates.ts`, `toISOString` в `src` не осталось), `-np1017` — да (`outcomes.ts`, `OutcomeTag.tsx`, `ConversationsPage.tsx`), `-sc1017` — **нет**: правка в `pages/ConversationPage.tsx`, а этого файла (как и `DemandPage.tsx`, `pages/Home*`) нет ни на сервере, ни на GitHub, ни в архивах `~/deploy-backups`. Описание правки — `services/frontend/HOTFIXES.md` в `master`. Полный `src` обещали выложить (known-issues №43).

### Как делать новую горячую правку (последовательность прошлых сессий)
1. Бэкап: `cp -a dist/index.html dist/index.html.before-<суффикс>` и копия правимых файлов в `~/voiceiq-backups/<тема>-<дата>/`.
2. Новый суффикс (например `-xx1018`). Скопировать **все** 45 файлов текущего поколения (`*-sc1017-np1017.js`) под новым суффиксом: чанки ссылаются друг на друга, частичная копия смешает поколения.
3. Внести правку в нужный чанк (минифицированный код, искать по уникальной строке).
4. Во всех новых файлах заменить ссылки `-<старый суффикс>.js` → `-<новый>.js`; проверить `grep -c` старого суффикса в новых файлах (должно быть 0).
5. Последним шагом поменять ссылку в `dist/index.html`. Проверить в браузере (жёсткая перезагрузка не нужна: HTML без кэша).
6. Откат — вернуть `index.html` из `.before-*`. Старые поколения не удалять: у открытых вкладок они ещё в работе.

## Мобильное приложение сотрудника (PWA без сборки)
- Исходники: `~/voiceiq/services/mobile/` (ES-модули `app.js`, `api.js`, `shift.js`, `coins.js`, `content.js`, `storage.js`, `styles.css`, `sw.js`, шрифты Onest, `README.md`).
- Опубликовано в `/var/www/voicer-mobile/` (владелец root): оболочка `app.html` = `index.html`, `sw.js`, иконки, manifest; модули — в `releases/<метка>/`. Сейчас `app.html` грузит `/releases/20261017-context/app.js` и `styles.css` (предыдущие: `20261014`, `20261014-demo`, `20261014-no-prices`). Файлы `api.js`, `shift.js`, `styles.css` в корне — старые копии, оболочка их не использует.
- Публикация: новая папка `releases/<метка>/`, затем `app.html`, `index.html` и `sw.js` с новыми путями. Нужны права root (sudo) — только с согласия пользователя. В README упоминается `deploy/mobile/publish-motivation.sh`, но в `~/voiceiq/deploy/mobile/` его нет (только nginx.conf).
- Разделы: «Моя смена», «Запись», «Монеты». Запись хранится фрагментами в IndexedDB и отправляется после остановки (`POST /api/v1/recorder/mobile/upload`, идемпотентно по client_upload_id); service worker не кэширует API и аудио. Цены и суммы в приложении скрыты намеренно.
- Подключение — по одноразовой ссылке из `/motivation` (auth-and-roles.md); руководитель может войти обычным логином для просмотра.
- Тестовая загрузка с Windows-машины: скрипт `upload_record.ps1` на ПК пользователя (путь — `.local/connection.md`) — логин на horeca.voicer-ai.pro и `POST /api/v1/recorder/upload` (это ручная загрузка, не мобильная); пароль пользователь вводит сам в терминале.

## Замысел экранов
Исходное описание экранов и UX (март–май 2026) — `product/screens.md`, ТЗ на фронтенд — `product/frontend-spec-tz11.md`. В начале обоих файлов блок «Актуальность» с тем, что изменилось. Список горячих правок `dist` и что из них нужно перенести в `src` — `services/frontend/HOTFIXES.md` (в `master`).
