# Авторизация, роли, витрины и домены

Проверено по коду и конфигам nginx 2026-10-17. `auth` = services/auth-service.

## Токены кабинета
| Что | Где | Детали |
|---|---|---|
| вход | `POST /api/v1/auth/login` (auth/app/routers/auth.py:106) | ищет пользователя по email **во всех организациях** (:108, `scalar_one_or_none`), bcrypt; отдаёт access + refresh + user |
| access JWT | auth/app/security.py:45 | HS256 `JWT_SECRET`, 15 мин, `type=access`, claims: sub, organization_id, role, store_id, rop_stores, [home_org] |
| refresh JWT | security.py:55 | 30 дней, `type=refresh`, в БД хранится bcrypt-хэш (`auth.refresh_tokens`) |
| обновление | `POST /api/v1/auth/refresh` (:120) | перебирает bcrypt-проверкой **все** неотозванные токены пользователя (:131-143), старый отзывает, выдаёт новую пару (витрина пересчитывается по домену запроса) |
| выход | `POST /api/v1/auth/logout` | отзывает все refresh-токены пользователя |
| проверка | `GET /api/v1/auth/verify` (:171) | вызывают все остальные сервисы; payload **без** home_org |
| смена пароля | `POST /api/v1/auth/users/{id}/change-password`; директор/админ — `PATCH /api/v1/auth/users/{id}` с `password` (≥ 8, отзывает refresh) | PATCH принимает first_name, last_name, store_id, is_active, password; **role игнорируется** (нет в UserUpdateRequest, auth/app/schemas.py:58) |
| из терминала | `bash ~/voiceiq/reset_password.sh <email>` | getpass в контейнере auth-service; UPDATE по email без учёта организации. Запускает пользователь |
`get_current_user` (auth/app/dependencies.py:83) проверяет, что пользователь существует и активен в `home_org` (если есть) или в `organization_id`.

Роли кабинета: `director`, `admin` (вся организация, управление пользователями и настройками), `rop` (несколько магазинов из `auth.rop_store_assignments`), `manager` (один `store_id`). Роль `service` — синтетическая для X-Internal-Key.

## Витрины по домену (DOMAIN_ORGS)
- Настройки только в коде: auth/app/config.py:17-19 (в compose не передаются):
  - `DOMAIN_ORGS = horeca.voicer-ai.pro=horeca-demo, pharma.voicer-ai.pro=pharmacy-demo, apteka.voicer-ai.pro=pharmacy-demo`
  - `mobile.voicer-ai.pro` автоматически = та же организация, что horeca (auth.py:52)
  - `DOMAIN_ORG_GUESTS = demo`
- Логика `_showcase_org` (auth.py:47): домен из `X-Forwarded-Host` или `Host` (обе nginx-прослойки передают Host). Если домен есть в списке, пользователь — director или admin, а его организация входит в DOMAIN_ORG_GUESTS → токен выдаётся на организацию витрины: `organization_id` = витрина, `home_org` = своя, `store_id=None`.
- Все остальные пользователи на любом домене входят в свою организацию (директор CoffeeDemo на horeca.voicer-ai.pro попадает в coffee-demo). 2026-10-16 DOMAIN_ORGS временно переключали на coffee-demo, но в тот же день вернули: пользователь хочет «старый вход → старая организация, новый вход → новая».
- У pharmacy-demo нет своих пользователей: туда можно попасть только гостем из demo через pharma.voicer-ai.pro (проверено по количеству пользователей 2026-10-17).
- Чтобы добавить витрину: дописать пару в DOMAIN_ORGS (код auth-service → пересборка), завести сайт в host-nginx и сертификат certbot (это решение пользователя, root).

## Мобильный доступ сотрудника (приложение mobile.voicer-ai.pro)
auth/app/routers/mobile.py, таблица `auth.mobile_accounts`:
1. Руководитель (director/admin, rop своих магазинов, manager своего магазина) в кабинете → `POST /api/v1/auth/mobile/invitations {seller_id}` → ссылка `https://mobile.voicer-ai.pro/app.html#connect=<key>` на 24 ч. Повторное приглашение увеличивает session_version и отзывает прежнее подключение.
2. Сотрудник открывает ссылку → `POST /api/v1/auth/mobile/claim {key}` → access JWT `type=mobile_access`, `role=employee`, sub = id mobile_account, seller_id, store_id, version; 15 мин. Refresh — случайная строка (sha256 в БД), 30 дней, `POST /api/v1/auth/mobile/refresh`.
3. Отзыв: `DELETE /api/v1/auth/mobile/accounts/{seller_id}`. Перевод продавца в другой магазин тоже обрывает сессию.
4. `GET /api/v1/auth/mobile/verify` принимает **и** мобильный, **и** обычный кабинетный токен (mobile.py:130): руководитель может войти в приложение логином кабинета. `GET /api/v1/auth/verify` мобильный токен не принимает.
Сервисы с эндпоинтами приложения (recorder `/mobile/*`, analytics tips, dashboard coins/shift) проверяют токен через `/auth/mobile/verify`.

## Межсервисный ключ X-Internal-Key
- Значение `INTERNAL_SERVICE_KEY` одинаково во всех сервисах.
- Принимают: transcription-service, admin-service, scripts-service (`get_current_user` → `{"role": "service", "organization_id": None}`, фильтр по организации снимается); recorder-service только для `/recordings/{id}/discard-context` (rec/app/routers/context.py:22, `hmac.compare_digest`).
- Не принимают: auth, analytics-engine, dashboard-service.
- Без всякой авторизации (доступны и снаружи через nginx): recorder `POST /api/v1/recorder/recordings/internal` (rec/app/routers/recordings.py:157) и `PATCH /api/v1/recorder/recordings/{id}/status` (:185), admin `GET /api/v1/admin/devices/by-serial/{serial}` (services/admin-service/app/routers/devices.py:109), `/api/v1/recorder/chunks*` (проверка только по серийному номеру). См. known-issues.md.

## Суперадмин
Консоль технического администратора: `GET /api/v1/auth/console/<SUPER_CONSOLE_PATH>` + API `/api/v1/auth/super/*`, вход по `auth.super_admins`, токен `type=super_access`. Подробно — `super-admin.md`. `bootstrap_admin.py` создаёт **директора** организации BOOTSTRAP_ORG_SLUG, а не суперадмина; coffee-demo 2026-10-16 создана ещё разовым скриптом с getpass. Настройки своей организации (org_type, industry, currency, timezone) меняет director/admin: `PATCH /api/v1/auth/organization`.

## Домены и nginx
Внешний host-nginx (root, `/etc/nginx/sites-enabled/`, сертификаты certbot):
| Домен | Куда | Особенности |
|---|---|---|
| lk.voicer-ai.pro | 127.0.0.1:8080 (compose-nginx) | основной кабинет, вход в свою организацию; body 550M, read_timeout 300s |
| horeca.voicer-ai.pro | 127.0.0.1:8080 | витрина horeca-demo для гостей из demo |
| pharma.voicer-ai.pro | 127.0.0.1:8080 | витрина pharmacy-demo (apteka.* в DOMAIN_ORGS есть, сайта в nginx нет) |
| mobile.voicer-ai.pro | статика `/var/www/voicer-mobile` + белый список API → 127.0.0.1:8080 | CSP, body 101m, timeout 900s; остальные `/api/` → 404 |
| sultansho.voicer-ai.pro | 127.0.0.1:8100 | чужой проект founder-cabinet |
| default | /var/www/html | — |
Белый список API мобильного домена: `auth/(login|refresh|verify|mobile/(claim|refresh|verify|profile))`, `admin/sellers`, `recorder/mobile/(upload|statuses)`, `dashboard/coins/sellers/{id}`, `dashboard/sellers/{id}/shift`, `analytics/sellers/{id}/tips`. Новый эндпоинт приложения требует правки этого regex (копия конфига без certbot-части — `~/voiceiq/deploy/mobile/nginx.conf`).

Compose-nginx (`~/voiceiq/nginx/nginx.conf`, монтируется read-only):
- `location /api/v1/<svc>/` → upstream сервиса; `/api/v1/users/` ведёт в auth, но такого префикса в auth нет (мёртвый маршрут; пользователи живут в `/api/v1/auth/users`).
- `/docs/<svc>/` — Swagger каждого сервиса, открыт наружу.
- `/` — SPA из `services/frontend/dist`, `*.html` без кэша, `*.js|*.css` с `expires 1y` и `immutable`.
- `client_max_body_size 512M`, `proxy_read_timeout 1800s` (снаружи host-nginx режет на 300s).
- Upstream'ы статические: после пересоздания контейнера обязательно `docker compose exec nginx nginx -s reload`.
Проверка конфига host-nginx и reload — только с sudo и с согласия пользователя (не проверялось, есть ли у `voicer` sudo).

## Роли кабинета: кто что делает
Замысел из исходной документации (март 2026), сверенный с кодом там, где это проверено. Детальной проверки каждой ручки на права не было — при сомнении смотреть `require_role(...)` в роутерах сервиса.

| Роль | Видит | Управляет |
|---|---|---|
| `director` | всю организацию | настройки организации (тип, отрасль, валюта, пояс), пользователи, магазины, продавцы, бейджи (в коде права те же, что у admin) |
| `admin` | всю организацию | то же, что director |
| `rop` | магазины из `rop_store_assignments` (claim `rop_stores`) | — |
| `manager` | свой `store_id` | скрипты и назначения своего магазина, продавцы своего магазина, мобильные приглашения своим продавцам |
| `employee` | только приложение: свои мобильные записи, смена, советы, монеты | — |
| `service` | всё, без фильтра по организации (X-Internal-Key) | — |
| `super_admin` | все организации через консоль | всё (см. `super-admin.md`) |

- РОП назначается на магазины через `POST /api/v1/auth/users/{id}/rop-stores` (только director/admin), назначения заменяются целиком.
- Несколько менеджеров на один магазин допустимы.
- Деактивированный пользователь (`is_active=false`) не входит, его refresh-токены отзываются, данные остаются.
- Фронтенд хранит токены в `localStorage['voiceiq-auth']` (persist zustand); при 401 axios-интерцептор вызывает `/auth/refresh`, при неудаче — выход на `/login`. Redis-blacklist токенов нет.
- Права при чтении записей — `database.md` («Права ролей при чтении записей»).
