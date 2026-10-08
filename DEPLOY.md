# Деплой VoiceIQ на сервер

## Первый раз (разовая настройка)

### 1. На сервере — клонируй репо

```bash
git clone https://github.com/Freezy113/voiceiq.git
cd voiceiq
```

> Репо приватное — при запросе логина/пароля введи GitHub username и **personal access token** (не пароль).
> Токен создаётся на https://github.com/settings/tokens → "Generate new token (classic)" → отметь `repo`.

Либо один раз настроить SSH-ключ сервера в GitHub (удобнее для автоматизации):
```bash
ssh-keygen -t ed25519 -C "voiceiq-server"
cat ~/.ssh/id_ed25519.pub   # добавить в GitHub → Settings → SSH Keys
git clone git@github.com:Freezy113/voiceiq.git
```

### 2. Создай .env

```bash
cp .env.example .env
nano .env   # заполни все значения
```

Для генерации случайных секретов:
```bash
openssl rand -hex 32   # запусти 2-3 раза для разных ключей
```

### 3. Запусти инфраструктуру

```bash
chmod +x deploy.sh

# Первый запуск — поднять только инфраструктуру (postgres, redis, rabbitmq, minio)
docker compose up -d postgres redis rabbitmq minio
sleep 10   # подождать пока БД поднимется

# Запустить всё
./deploy.sh --full-rebuild
```

---

## Обновление (каждый раз при новом коде)

```bash
cd voiceiq
./deploy.sh
```

Скрипт автоматически:
- Делает `git pull`
- Пересобирает изменившиеся образы
- Прогоняет миграции БД
- Перезапускает контейнеры

---

## Выкатка через GitHub Actions

Workflow `.github/workflows/deploy.yml` выкатывает с раннера GitHub по SSH, запуск вручную: Actions → Deploy → Run workflow.
- `check` ничего не меняет: показывает состояние сервера, какие файлы `services/` и фронтенда изменятся, отличия `docker-compose.yml` и `nginx.conf`.
- `deploy`: бэкап БД в `~/deploy-backups` (последние 10), файлы `services/` (без `.env` и без удаления), сборка выбранных сервисов, `alembic upgrade head` для analytics-engine, перезапуск, перезапуск nginx, собранный фронтенд, проверка нового эндпоинта.

`docker-compose.yml`, `nginx/` и `.env` на сервере workflow не трогает.

Разовая настройка:
1. Отдельный ключ для выкатки (на своём компьютере):
   ```bash
   ssh-keygen -t ed25519 -N '' -C github-deploy -f voicer_deploy
   ssh voicer@185.32.85.82 'cat >> ~/.ssh/authorized_keys' < voicer_deploy.pub
   ssh-keyscan 185.32.85.82 > known_hosts_prod
   ```
2. GitHub → Settings → Secrets and variables → Actions → New repository secret:
   - `DEPLOY_SSH_KEY` — содержимое `voicer_deploy` (приватный ключ);
   - `DEPLOY_KNOWN_HOSTS` — содержимое `known_hosts_prod`;
   - `DEPLOY_HOST` — `185.32.85.82`;
   - `DEPLOY_USER` — `voicer`.
   Каталог проекта, если не `/home/voicer/voiceiq`, — в Variables как `DEPLOY_PATH`. После этого файл `voicer_deploy` удалить.
3. Порт 22 должен быть открыт для раннеров GitHub: если группа безопасности в Yandex Cloud пускает SSH только с ваших адресов, выкатка не подключится.
4. Пользователь `voicer` должен иметь доступ к docker (группа `docker` или `sudo` без пароля) и быть владельцем каталога проекта.
5. Workflow с ручным запуском виден в Actions, только когда файл есть в ветке по умолчанию (`main`). Запускать можно на любой ветке.

---

## Полный пересбор (если что-то сломалось)

```bash
./deploy.sh --full-rebuild
```

---

## Полезные команды

```bash
# Логи всех сервисов
docker compose logs -f --tail=50

# Логи конкретного сервиса
docker compose logs -f analytics-worker

# Статус контейнеров
docker compose ps

# Перезапустить один сервис
docker compose restart analytics-worker

# Зайти внутрь контейнера
docker compose exec analytics-worker bash

# Остановить всё
docker compose down

# Остановить и удалить данные (ОСТОРОЖНО!)
docker compose down -v
```

---

## Порты

| Сервис | Порт |
|--------|------|
| API (nginx) | **80** |
| PostgreSQL | 5432 |
| RabbitMQ UI | 15672 |
| MinIO Console | 9001 |
| Redis | 6379 |
