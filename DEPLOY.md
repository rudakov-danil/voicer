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
