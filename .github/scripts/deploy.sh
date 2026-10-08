#!/usr/bin/env bash
# Выкатка на прод с раннера GitHub Actions (.github/workflows/deploy.yml).
# Ждёт Host prod в ~/.ssh/config и собранный services/frontend/dist.
#   deploy.sh check   — ничего не меняет на сервере
#   deploy.sh deploy  — бэкап, файлы, сборка, миграции, перезапуск, фронтенд
#   deploy.sh verify  — только проверка, что выкаченное отвечает
#   deploy.sh reanalyze — повторный анализ записей ($REANALYZE)
set -euo pipefail

MODE=${1:?check или deploy}
: "${APP_DIR:?}" "${SERVICES:?}"
[[ $SERVICES =~ ^[a-z0-9\ -]+$ ]] || { echo "::error::Странный список сервисов: $SERVICES"; exit 1; }

cd "$(dirname "$0")/../.."

# Скрипт remote.sh выполняется на сервере с одним аргументом — этапом
remote() {
  ssh prod "APP_DIR=$(printf %q "$APP_DIR") SERVICES=$(printf %q "$SERVICES") REANALYZE=$(printf %q "${REANALYZE:-}") bash -s -- $1" < .github/scripts/remote.sh
}

# Каталог сборки сервиса из docker-compose.yml (строка «build: ./services/…»)
build_dir() {
  awk -v s="  $1:" '$0 == s {f = 1; next} f && /^  [a-z0-9-]+:$/ {exit} f && $1 == "build:" {print $2; exit}' docker-compose.yml
}

# Копируем только каталоги выкатываемых сервисов: остальной код на сервере
# может отличаться от репозитория, и чужие правки трогать нельзя.
DIRS=()
for s in $SERVICES; do
  d=$(build_dir "$s")
  d=${d#./}
  [[ $d =~ ^services/[a-z0-9-]+$ ]] || { echo "::error::Не нашёл каталог сборки для $s"; exit 1; }
  [[ " ${DIRS[*]} " == *" $d "* ]] || DIRS+=("$d")
done

# Без --delete: файлы, которые есть только на сервере, не трогаем
SYNC=(-rlc --exclude=node_modules/ --exclude=__pycache__/ --exclude='*.pyc' --exclude=.venv/ --exclude=venv/
      --exclude=.pytest_cache/ --exclude=.env)
# Старые чанки фронтенда оставляем: открытые вкладки ещё могут их запросить
DIST=(-rlc)

# Куда смотрит домен и отвечает ли на него сервер (с раннера, у него открытый интернет)
check_domain() {
  local d=$1 ip a
  [[ $d =~ ^[a-z0-9.-]+$ ]] || { echo "Странный домен: $d"; return; }
  ip=$(ssh -G prod | awk '$1 == "hostname" {print $2}')
  a=$(dig +short A "$d" | grep -E '^[0-9.]+$' | sort -u | tr '\n' ' ' || true)
  echo "== Домен $d"
  echo "A-записи: ${a:-нет}"
  echo "CNAME: $(dig +short CNAME "$d" | tr '\n' ' ')"
  echo "NS зоны ${d#*.}: $(dig +short NS "${d#*.}" | tr '\n' ' ')"
  if [[ " $a " == *" $ip "* ]]; then echo "Указывает на этот сервер: да"; else echo "Указывает на этот сервер: нет"; fi
  echo "http://$d по DNS: $(curl -sS -o /dev/null -m 15 -w '%{http_code} %{redirect_url}' "http://$d/" 2>&1)"
  echo "https://$d по DNS: $(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$d/" 2>&1)"
  echo "https://$d напрямую на этом сервере: $(curl -sSk -o /dev/null -m 15 -w '%{http_code}' --resolve "$d:443:$ip" "https://$d/" 2>&1)"
  echo "Сертификат, который этот сервер отдаёт для $d:"
  openssl s_client -connect "$ip:443" -servername "$d" </dev/null 2>/dev/null \
    | openssl x509 -noout -subject -issuer -enddate -ext subjectAltName 2>&1 | sed 's/^/  /' || true
}

case $MODE in
  check)
    remote check
    for d in "${DIRS[@]}"; do
      echo "== Скопируется в $d"
      rsync "${SYNC[@]}" -n -i "$d/" prod:"$APP_DIR/$d/" | grep -v '^\.' || true
    done
    echo "== Скопируется файлов фронтенда: $(rsync "${DIST[@]}" -n -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/" | grep -vc '^\.' || true)"
    echo "== Отличается от репозитория в других сервисах (не копируется)"
    others=(--exclude=/frontend/)
    for d in "${DIRS[@]}"; do others+=("--exclude=/${d#services/}/"); done
    rsync "${SYNC[@]}" "${others[@]}" -n -i services/ prod:"$APP_DIR/services/" | grep -v '^\.' | head -100 || true
    for f in docker-compose.yml nginx/nginx.conf; do
      echo "== Отличия $f (сервер → репозиторий, не копируется)"
      ssh prod cat "$APP_DIR/$f" 2>/dev/null | diff -u - "$f" | head -120 || true
    done
    if [ -n "${DOMAIN:-}" ]; then check_domain "$DOMAIN"; fi
    ;;
  deploy)
    remote backup
    for d in "${DIRS[@]}"; do
      rsync "${SYNC[@]}" -i "$d/" prod:"$APP_DIR/$d/"
    done
    remote apply
    rsync "${DIST[@]}" -i services/frontend/dist/ prod:"$APP_DIR/services/frontend/dist/"
    remote verify
    ;;
  verify)
    remote verify
    ;;
  llm-test)
    remote llm-test
    ;;
  deepgram-test)
    remote deepgram-test
    ;;
  logs)
    remote logs
    ;;
  worker-log)
    remote worker-log
    ;;
  conv-info)
    remote conv-info
    ;;
  roles-compare)
    remote roles-compare
    ;;
  deepgram-words)
    remote deepgram-words
    ;;
  deepgram-compare)
    remote deepgram-compare
    ;;
  llm-usage)
    remote llm-usage
    ;;
  reupload)
    [[ ${REANALYZE:-} =~ ^(--latest\ [0-9]+|[0-9a-f-]{36}(\ [0-9a-f-]{36})*)$ ]] \
      || { echo "::error::recordings: «--latest N» или id записей через пробел"; exit 1; }
    remote reupload
    ;;
  reprocess)
    [[ ${REANALYZE:-} =~ ^(--latest\ [0-9]+|[0-9a-f-]{36}(\ [0-9a-f-]{36})*)$ ]] \
      || { echo "::error::recordings: «--latest N» или id записей через пробел"; exit 1; }
    remote reprocess
    ;;
  rediarize)
    [[ ${REANALYZE:-} =~ ^(--latest\ [0-9]+|[0-9a-f-]{36}(\ [0-9a-f-]{36})*)$ ]] \
      || { echo "::error::recordings: «--latest N» или id записей через пробел"; exit 1; }
    remote rediarize
    ;;
  server-diff)
    # Чем код сервисов на сервере отличается от репозитория (repo → сервер).
    # Похожее на ключи и токены заменяем на [скрыто].
    for d in "${DIRS[@]}"; do
      echo "== $d"
      rsync "${SYNC[@]}" -n -i "$d/" prod:"$APP_DIR/$d/" | awk '$1 ~ /^<f/ {print $2}' | while read -r f; do
        ssh -n prod cat "$APP_DIR/$d/$f" 2>/dev/null \
          | diff -u --label "a/$d/$f" --label "b/$d/$f" "$d/$f" - \
          | sed -E 's/(sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_+=]{40,})/[скрыто]/g' || true
      done
      echo "== Есть только на сервере в $d"
      rsync "${SYNC[@]}" --delete -n -i "$d/" prod:"$APP_DIR/$d/" | awk '$1 == "*deleting" {print $2}' | while read -r f; do
        echo "$f"
        # Исходники Python выводим целиком: строки с префиксом «| », чтобы сохранить отступы
        case $f in
          *.py)
            echo "=== FILE $d/$f"
            ssh -n prod cat "$APP_DIR/$d/$f" | sed -E 's/(sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_+=]{40,})/[скрыто]/g; s/^/| /'
            echo "=== END $d/$f"
            ;;
        esac
      done || true
    done
    ;;
  reanalyze)
    [[ ${REANALYZE:-} =~ ^(--latest\ [0-9]+|[0-9a-f-]{36}(\ [0-9a-f-]{36})*)$ ]] \
      || { echo "::error::recordings: «--latest N» или id записей через пробел"; exit 1; }
    remote reanalyze
    ;;
  *)
    echo "::error::Неизвестный режим: $MODE"
    exit 1
    ;;
esac
