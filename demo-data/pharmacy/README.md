# Демо аптечной сети «Садыхан» (pharma.voicer-ai.pro)

Синтетическая сеть: три аптеки (Алматы — Абая и Самал, Астана — Есиль), восемь фармацевтов, четыре недели
разговоров у кассы. Цены в тенге, часовой пояс сети — Asia/Almaty. Все цифры в кабинете сходятся с текстом
разговоров: каждый визит генерируется из одного сценария — диалог, просьба и наличие, аналог или заказ,
допродажи с приёмом и ответом покупателя, чек, этапы скрипта, возражения, нарушения. LLM не нужен.

Данные вымышленные: совпадение названия с реальной сетью — только для показа, имена и адреса условные.

## Что показывает демо

- **Спрос** (раздел «Спрос»): что покупатели просили, а этого не оказалось. «Нурофен Экспресс» заканчивается
  на Абая, «Мирамистин» и «Ксарелто» — в Есиле, смесь «Нутрилон» и тест-полоски — на Самале; к концу месяца
  растёт простуда — «Терафлю» и «Эргоферон» заканчиваются чаще; «Avène Cicalfate» сеть не держит.
  По каждой позиции видно, сколько ушли без покупки, сколько купили аналог и какой, в каких аптеках
  спрашивали. Руководитель отмечает «В закупку / Заказано / Не закупаем» и выгружает список в Excel.
  Три решения уже стоят как пример: Нурофен — в закупку, тест-полоски — заказано, Аквамарис — закрываем аналогом.
- **Допродажи** — та же механика, что у кофеен: доля покупок с предложением, согласия, чек с допродажей,
  план смены (60 %, 8 допродаж, товар дня — витамин D3; у Есиля план 50 %).
- **Фармацевты разные**: Светлана и Айгерим почти всегда предлагают аналог и объясняют действие; Ержан —
  редко, у него больше всего ушедших без покупки; Асель продаёт много, но иногда давит после отказа;
  Даурен — новичок, подтягивается неделя к неделе; Тимур спешит в пик и отпускает антибиотик без рецепта.

## Как устроен поддомен

Домен сам выбирает данные: auth-service сопоставляет домен и организацию (`DOMAIN_ORGS` в
`services/auth-service/app/config.py`): `pharma.voicer-ai.pro` и `apteka.voicer-ai.pro` → `pharmacy-demo`.
Директор или админ организации Demo, войдя на этот домен, сразу попадает в аптеки — отдельная учётка не нужна.
Подпись на странице входа берётся из имени поддомена (`pages/LoginPage.tsx`, `SHOWCASES`).

`pharma.voicer-ai.pro` включён 14.10.2026: vhost `/etc/nginx/sites-available/pharma.voicer-ai.pro` (→ 127.0.0.1:8080), сертификат Let's Encrypt до 12.01.2027, продление — certbot.timer.

Чтобы включить ещё один поддомен (пример для `pharma`):

1. В DNS-зоне voicer-ai.pro добавить запись `A pharma → 185.32.85.82`.
2. На сервере — vhost по образцу horeca и сертификат:

```bash
sudo sed 's/horeca\.voicer-ai\.pro/pharma.voicer-ai.pro/g' /etc/nginx/sites-available/horeca.voicer-ai.pro | sudo tee /etc/nginx/sites-available/pharma.voicer-ai.pro
sudo ln -s /etc/nginx/sites-available/pharma.voicer-ai.pro /etc/nginx/sites-enabled/
sudo certbot --nginx -d pharma.voicer-ai.pro
sudo nginx -t && sudo systemctl reload nginx
```

Если certbot ругается на отсутствующий сертификат в скопированном vhost, сначала оставьте в файле только
блок `listen 80` с `proxy_pass http://127.0.0.1:8080;`, затем запустите certbot — он добавит HTTPS сам.

## Файлы

| Файл | Где запускать | Что делает |
|---|---|---|
| `seed.sql` | postgres | организация (industry pharmacy, KZT, Asia/Almaty), аптеки, фармацевты, план смены |
| `install_pack.py <org_id> <user_id>` | scripts-service | пакет «Аптечная сеть»: скрипт фармацевта, правила допродаж, возражения, правила общения |
| `pharmacy_demo.py <org_id> <YYYY-MM-DD> [--until=HH:MM] [--dry]` | dashboard-service | пересоздаёт 28 дней визитов; сегодня — до текущего времени по Алматы |
| `ids.txt` | — | id организации и служебного автора правил |

## Первичная установка и обновление данных

```bash
cd ~/voiceiq && P=demo-data/pharmacy && read ORG SYS < $P/ids.txt
docker compose exec -T postgres psql -U voiceiq -d voiceiq -v ON_ERROR_STOP=1 -q < $P/seed.sql
docker cp $P/install_pack.py voiceiq-scripts-service-1:/app/install_pack.py
docker compose exec -T scripts-service python install_pack.py $ORG $SYS
docker cp $P/pharmacy_demo.py voiceiq-dashboard-service-1:/tmp/pharmacy_demo.py
docker compose exec -T dashboard-service python /tmp/pharmacy_demo.py $ORG $(TZ=Asia/Almaty date +%F)
docker compose exec -T redis sh -c "redis-cli --scan --pattern 'dashboard:*$ORG*' | xargs -r redis-cli del"
```

Повторный запуск `pharmacy_demo.py` пересоздаёт только разговоры, записи, расшифровки и кэш подсказок этой
организации. Решения по списку закупки не трогает. Демо привязано к датам: без регулярного перезапуска
«сегодня» утром пустое (на экране «Допродажи» есть кнопка перейти к последней смене).
