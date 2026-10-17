"""Демо аптечной сети «Садыхан» для pharma.voicer-ai.pro: 4 недели разговоров у кассы, без LLM.

Каждый визит строится из одного сценария: по нему пишется диалог (расшифровка) и его разбор — что
просили, было ли в наличии, что предложили взамен, допродажи (приём и ответ), чек, этапы скрипта,
возражения, нарушения. Поэтому любая цифра в кабинете сходится с текстом разговора.

Сюжет демо:
  * спрос: «Нурофен Экспресс» постоянно заканчивается на Абая, «Мирамистин» и «Ксарелто» — в Есиле,
    смесь «Нутрилон» и тест-полоски — на Самале; к концу месяца растёт простуда — «Терафлю» и «Эргоферон»
    заканчиваются чаще; «Avène Cicalfate» сеть не держит, а спрашивают;
  * у фармацевтов разный стиль: Светлана и Айгерим почти всегда предлагают аналог и объясняют действие,
    Ержан аналог предлагает редко — у него больше всего ушедших без покупки; Асель продаёт много, но
    давит после отказа; Даурен — новичок, подтягивается неделя к неделе; Тимур спешит в пик и однажды
    отпускает антибиотик без рецепта;
  * «Что-нибудь ещё?» почти не работает, лучше всего — польза для лечения («с антибиотиком — пробиотик»);
  * товар дня — витамин D3 (осень).

Запуск в контейнере с asyncpg (dashboard-service):
  python pharmacy_demo.py <organization_id> <сегодня YYYY-MM-DD> [--until=HH:MM] [--dry]
Пересоздаёт разговоры демо-организации: старые разговоры, записи и расшифровки удаляются. Решения по
списку закупки (analytics.demand_items) не трогаются, примеры решений добавляются только если их нет.
Сегодня — визиты до текущего времени по Алматы минус 5 минут; --until задаёт время явно.
"""
import asyncio
import json
import os
import random
import re
import sys
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

ORG = uuid.UUID(sys.argv[1])
TODAY = date.fromisoformat(sys.argv[2])
DRY = "--dry" in sys.argv
DAYS = 28
ALMATY = timezone(timedelta(hours=5))
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://pharma.voicer-ai.pro/demo")
rnd = random.Random(f"sadykhan-{TODAY.isoformat()}")


def _until() -> time:
    for a in sys.argv[3:]:
        if a.startswith("--until="):
            hh, mm = a.split("=", 1)[1].split(":")
            return time(int(hh), int(mm))
    now = datetime.now(ALMATY)
    if now.date() == TODAY:
        cut = now - timedelta(minutes=5)
        return cut.time() if cut.date() == TODAY else time(0, 0)
    return time(13, 0)


UNTIL = _until()


def uid() -> uuid.UUID:
    return uuid.UUID(int=rnd.getrandbits(128), version=4)


def pick(seq):
    return rnd.choice(seq)


def chance(p: float) -> bool:
    return rnd.random() < max(0.0, min(1.0, p))


def demand_key(item: str) -> str:
    """Как analytics-engine response_parser.demand_key: одна позиция — один ключ."""
    s = (item or "").casefold().replace("ё", "е")
    s = re.sub(r"(\d)\s*(мг|мл|г|шт|таб)\b", r"\1 \2", s)
    s = re.sub(r"[^\w%]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()[:255]


def tenge(n: int) -> str:
    return f"{n:,}".replace(",", " ")


# ─── Аптеки и фармацевты ──────────────────────────────────────────────────────
STORES = {  # ключ: (визитов в день, команда — двое на смене по кругу)
    "abaya": (92, ["aigerim", "erzhan", "maria"]),
    "samal": (70, ["asel", "dauren"]),
    "esil": (60, ["svetlana", "timur", "dana"]),
}
# offer — доля покупок с конкретным предложением; generic — «что-нибудь ещё?» вместо него;
# accept — множитель согласий; analog — предлагает ли замену, когда товара нет; explain — объясняет
# действие и приём; order — предлагает заказать к нужному дню; polite — полнота этапов
STYLE = {
    "aigerim": dict(offer=0.66, generic=0.05, accept=1.15, analog=0.9, explain=0.9, order=0.6, polite=0.97, loyalty=0.35, focus=0.4),
    "erzhan": dict(offer=0.36, generic=0.26, accept=0.95, analog=0.3, explain=0.5, order=0.15, polite=0.8, loyalty=0.15, focus=0.12, careless=0.3),
    "maria": dict(offer=0.58, generic=0.08, accept=1.05, analog=0.8, explain=0.85, order=0.5, polite=0.95, loyalty=0.3, focus=0.33),
    "asel": dict(offer=0.72, generic=0.04, accept=0.78, analog=0.7, explain=0.7, order=0.4, polite=0.85, loyalty=0.32, focus=0.45, pushy=0.04),
    "dauren": dict(offer=0.2, generic=0.45, accept=0.85, analog=0.5, explain=0.45, order=0.25, polite=0.85, loyalty=0.1, focus=0.1, harm=0.008),
    "svetlana": dict(offer=0.62, generic=0.06, accept=1.2, analog=0.95, explain=0.97, order=0.7, polite=0.98, loyalty=0.3, focus=0.35),
    "timur": dict(offer=0.45, generic=0.2, accept=0.9, analog=0.55, explain=0.55, order=0.3, polite=0.7, loyalty=0.15, focus=0.2, rx_slip=0.35, careless=0.4),
    "dana": dict(offer=0.54, generic=0.1, accept=1.0, analog=0.75, explain=0.8, order=0.45, polite=0.9, loyalty=0.25, focus=0.3),
}
WEEK_TREND = [0.88, 0.94, 1.0, 1.05]  # план допродаж ввели месяц назад — сеть растёт
DAUREN_OFFER = [0.18, 0.27, 0.35, 0.42]
DAUREN_GENERIC = [0.5, 0.38, 0.28, 0.2]
COLD_SEASON = [0.8, 0.95, 1.12, 1.35]  # простуда к концу месяца: больше визитов и чаще заканчивается
ACCEPT = {"generic": 0.05, "specific": 0.18, "choice": 0.27, "benefit": 0.33, "promo": 0.28}
HOUR_WEIGHTS = {8: 4, 9: 7, 10: 8, 11: 6, 12: 6, 13: 7, 14: 5, 15: 4, 16: 5, 17: 7, 18: 9, 19: 9, 20: 6, 21: 3}
PEAK = {9, 10, 18, 19}
FOCUS = ("Витамин D3 2000 МЕ", 3400)

# ─── Что спрашивают ───────────────────────────────────────────────────────────
# name — как называет покупатель (и как попадёт в «Спрос»); price — тенге; cat — категория спроса;
# oos — базовая вероятность, что нет в наличии; analogs — (название, цена, вероятность взять);
# size — упаковка побольше (название, цена); rx — рецептурный; nc — сеть такое не держит
R = lambda group, name, price, cat="otc", oos=0.02, analogs=(), size=None, rx=False, nc=False, asks=None, w=1.0, cross=None: dict(
    group=group, name=name, price=price, cat=cat, oos=oos, analogs=list(analogs), size=size, rx=rx, nc=nc, asks=asks, w=w,
    cross=cross or group)
REQUESTS = [
    R("cold", "Терафлю Экстра", 3200, oos=0.09, analogs=[("Фервекс", 2600, 0.55), ("Колдрекс МаксГрипп", 2900, 0.5)], w=3,
      asks=["Терафлю есть?", "Мне Терафлю Экстра, пожалуйста.", "Дайте Терафлю от простуды."]),
    R("cold", "Ибуклин", 1100, w=1.2, asks=["Ибуклин, пожалуйста."]),
    R("cold", "Эргоферон", 3600, oos=0.1, analogs=[("Анаферон", 2100, 0.35)], w=1.6,
      asks=["Эргоферон есть?", "Мне Эргоферон, от простуды начинающейся."]),
    R("cold", "Синупрет", 3700, oos=0.07, w=0.8, asks=["Синупрет есть, таблетки?"]),
    R("cold", "Мирамистин 150 мл", 2850, oos=0.1, analogs=[("Хлоргексидин спрей", 600, 0.3)], w=1.4,
      asks=["Мирамистин есть, большой?", "Мне Мирамистин сто пятьдесят миллилитров."]),
    R("cold", "Аквамарис спрей", 2600, oos=0.1, analogs=[("Аквалор Софт", 2400, 0.65)], w=1.4,
      asks=["Аквамарис спрей есть?", "Аквамарис для носа, пожалуйста."]),
    R("cold", "Тантум Верде спрей", 2950, w=1.6, asks=["Что-нибудь от горла, спрей.", "Горло болит, посоветуйте спрей."]),
    R("cold", "Парацетамол 500 мг", 250, w=1.2, asks=["Что-нибудь от температуры, парацетамол.", "Парацетамол, пожалуйста."]),
    R("pain", "Нурофен Экспресс 200 мг", 1650, oos=0.08, analogs=[("Ибупрофен 200 мг", 420, 0.5), ("МИГ 400", 1350, 0.45)],
      size=("Нурофен Экспресс 200 мг №20", 2900), w=3, cross="headache", asks=["Нурофен экспресс есть?", "Мне Нурофен Экспресс, двести.", "Нурофен в капсулах, пожалуйста."]),
    R("pain", "Цитрамон П", 180, w=1.5, cross="headache", asks=["Цитрамон, пожалуйста.", "Дайте цитрамон."]),
    R("pain", "Пенталгин", 1450, oos=0.04, analogs=[("Каффетин", 1300, 0.5)], w=1.2, cross="headache", asks=["Пенталгин есть?"]),
    R("pain", "Ибупрофен 200 мг", 420, size=("Ибупрофен 200 мг №50", 900), w=1.4,
      asks=["Спина болит, что-нибудь обезболивающее недорогое.", "Ибупрофен, пожалуйста."]),
    R("gi", "Креон 25000", 5800, oos=0.1, analogs=[("Микразим 25000", 3900, 0.45)], w=1.1, asks=["Креон двадцать пять тысяч есть?"]),
    R("gi", "Смекта", 1900, w=1.3, asks=["Смекту, пожалуйста.", "Что-нибудь от расстройства, Смекта есть?"]),
    R("gi", "Мезим Форте", 1100, size=("Мезим Форте №80", 3300), w=1.2, asks=["Мезим, пожалуйста."]),
    R("gi", "Энтеросгель", 3400, oos=0.04, w=0.9, asks=["Энтеросгель есть?"]),
    R("abx", "Амоксиклав 875 мг", 4300, cat="rx", rx=True, oos=0.06, analogs=[("Флемоклав Солютаб 875 мг", 5100, 0.55)], w=1.4,
      asks=["Мне Амоксиклав по рецепту.", "Амоксиклав восемьсот семьдесят пять, вот рецепт."]),
    R("abx", "Азитромицин 500 мг", 1200, cat="rx", rx=True, oos=0.03, w=1.0, asks=["Азитромицин пятьсот, по рецепту."]),
    R("allergy", "Зиртек", 2300, oos=0.03, analogs=[("Цетиризин", 600, 0.6)], w=1.0, asks=["Зиртек есть?"]),
    R("allergy", "Лоратадин", 350, w=1.0, asks=["Что-нибудь от аллергии, лоратадин."]),
    R("allergy", "Эриус", 3700, oos=0.05, analogs=[("Дезлоратадин", 1500, 0.55)], w=0.8, asks=["Эриус таблетки есть?"]),
    R("kids", "Нурофен для детей сироп", 1950, oos=0.06, analogs=[("Ибупрофен детский сироп", 900, 0.45)], w=1.3,
      asks=["Нурофен детский сироп есть?", "Ребёнку от температуры, Нурофен сироп."]),
    R("kids", "Називин 0,01% детский", 1600, oos=0.09, analogs=[("Отривин Бэби", 2100, 0.5)], w=1.0, asks=["Називин детский есть, ноль ноль один?"]),
    R("kids", "Эспумизан Бэби", 3400, oos=0.1, analogs=[("Боботик", 2200, 0.5)], w=1.0, asks=["Эспумизан бэби есть?", "От коликов малышу, Эспумизан."]),
    R("kids", "Nutrilon Комфорт 1", 8900, cat="baby", oos=0.12, w=1.0, asks=["Нутрилон Комфорт один есть?", "Смесь Нутрилон комфорт, первая."]),
    R("kids", "ФрутоНяня пюре", 450, cat="baby", nc=True, w=0.1, asks=["Детское пюре ФрутоНяня у вас есть?"]),
    R("chronic", "Ксарелто 20 мг", 21500, cat="rx", rx=True, oos=0.14, w=1.0, asks=["Ксарелто двадцать есть? Рецепт с собой.", "Мне Ксарелто, вот рецепт."]),
    R("chronic", "Конкор 5 мг", 2900, cat="rx", rx=True, w=1.0, asks=["Конкор пять, по рецепту."]),
    R("chronic", "Лозап 50 мг", 3800, cat="rx", rx=True, w=0.9, asks=["Лозап пятьдесят, вот рецепт."]),
    R("device", "Тест-полоски Accu-Chek Active", 9800, cat="medical", oos=0.16, w=1.0,
      asks=["Тест-полоски Акку-Чек Актив есть?", "Полоски для глюкометра Акку-Чек Актив, пятьдесят штук."]),
    R("device", "Термометр электронный", 1900, cat="medical", w=0.6, asks=["Градусник электронный есть?"]),
    R("device", "Тонометр Omron M2", 24900, cat="medical", oos=0.05, w=0.4, asks=["Тонометр Омрон есть, автоматический?"]),
    R("vitamins", "Магне B6 Форте", 5900, cat="supplement", oos=0.08, analogs=[("Магнелис B6", 2600, 0.6)], w=1.1, asks=["Магне B6 форте есть?"]),
    R("vitamins", "Пиковит", 2800, cat="supplement", oos=0.1, analogs=[("Супрадин Кидс", 4500, 0.4)], w=0.9, asks=["Пиковит ребёнку есть?"]),
    R("vitamins", "Компливит", 2400, cat="supplement", w=0.9, asks=["Компливит, пожалуйста."]),
    R("vitamins", "Омега-3", 4900, cat="supplement", w=0.7, asks=["Омега-три есть?"]),
    R("care", "Пантенол спрей", 2100, cat="cosmetics", w=0.9, asks=["Пантенол спрей, от ожога."]),
    R("care", "Avène Cicalfate", 6200, cat="cosmetics", nc=True, analogs=[("Бепантен Плюс", 3600, 0.35)], w=0.16,
      asks=["Крем Авен Сикальфат у вас есть?"]),
]
# Где что заканчивается чаще: сюжет «по аптекам» в разделе «Спрос»
STORE_OOS = {
    "abaya": {"Нурофен Экспресс 200 мг": 3.2, "Креон 25000": 1.4},
    "samal": {"Nutrilon Комфорт 1": 2.4, "Тест-полоски Accu-Chek Active": 2.0, "Эспумизан Бэби": 1.5},
    "esil": {"Мирамистин 150 мл": 2.8, "Ксарелто 20 мг": 2.2, "Магне B6 Форте": 1.5},
}
COLD_ITEMS = {"Терафлю Экстра", "Эргоферон", "Мирамистин 150 мл", "Аквамарис спрей"}

# Сопутствующее по группам: (что, цена, фраза — приём → текст)
CROSS = {
    "cold": [("Тантум Верде спрей", 2950, "спрей для горла"), ("Витамин C 1000", 1200, "витамин C"), ("Аквамарис спрей", 2600, "спрей для носа")],
    "pain": [("Долгит крем", 2400, "крем для спины"), ("Пластырь Нанопласт", 1800, "пластырь от боли")],
    # Головная боль: к таблеткам — вода в дорогу и магний при напряжении, а не крем для спины
    "headache": [("Вода питьевая 0,5 л", 250, "воду запить"), ("Магнелис B6", 2600, "магний B6")],
    "gi": [("Линекс", 3900, "пробиотик"), ("Регидрон", 1300, "регидрон")],
    "abx": [("Линекс", 3900, "пробиотик"), ("Бифиформ", 4300, "пробиотик")],
    "allergy": [("Аллергодил капли", 3300, "капли для глаз"), ("Аквамарис спрей", 2600, "промывание носа")],
    "kids": [("Пантенол спрей", 2100, "пантенол"), ("Аквамарис беби", 2700, "капли для носика")],
    "chronic": [("Омега-3", 4900, "омегу-3")],
    "device": [("Ланцеты Accu-Chek Softclix", 2200, "ланцеты"), ("Батарейки АА", 600, "батарейки")],
    "vitamins": [("Омега-3", 4900, "омегу-3")],
    "care": [("Гигиеническая помада", 900, "гигиеническую помаду")],
}
REASONS = {  # аргумент к сопутствующему — для приёма «с пользой»
    "спрей для горла": "боль в горле пройдёт быстрее", "витамин C": "поддержит иммунитет, пока болеете",
    "спрей для носа": "промывание снимет заложенность", "крем для спины": "крем снимет боль прямо в месте",
    "пластырь от боли": "держит сутки, удобно на работе", "пробиотик": "он защитит кишечник",
    "регидрон": "при расстройстве важно восполнить воду", "капли для глаз": "снимут зуд и слезотечение",
    "промывание носа": "смоет аллерген со слизистой", "пантенол": "пригодится от покраснений",
    "капли для носика": "мягко промоют носик малышу", "омегу-3": "полезна для сердца и сосудов",
    "ланцеты": "без них полоски не помогут", "батарейки": "чтобы прибор не сел в нужный момент",
    "воду запить": "таблетку лучше запить сразу", "магний B6": "многие берут его при усталости и напряжении",
    "гигиеническую помаду": "губы на ветру не потрескаются",
}
MISSED = {  # что можно было сказать, если сверх просьбы ничего не предложили
    "cold": ("К средству от простуды не предложили спрей для горла", "К средству от простуды возьмите спрей для горла — боль пройдёт быстрее."),
    "pain": ("Не предложили упаковку побольше", "Возьмите упаковку побольше — на курс выйдет выгоднее."),
    "gi": ("Не предложили пробиотик или регидрон", "При расстройстве важно восполнить воду — регидрон возьмёте?"),
    "abx": ("К антибиотику не предложили пробиотик", "С антибиотиком лучше пропить пробиотик — он защитит кишечник."),
    "allergy": ("Не предложили капли для глаз", "Если глаза слезятся, капли снимут это быстрее — добавить?"),
    "kids": ("Не предложили средство для носика", "Для промывания носика малышу — Аквамарис беби, он очень мягкий."),
    "chronic": ("Не предложили взять на несколько месяцев", "Возьмите сразу на три месяца — не придётся искать, если закончится."),
    "device": ("К полоскам не предложили ланцеты", "Ланцеты к полоскам есть? Могу добавить упаковку."),
    "vitamins": ("Не предложили полный курс", "На полный курс нужно две упаковки — возьмёте сразу?"),
    "care": ("Не предложили карту лояльности", "Оформим карту «Садыхан»? Бонусы вернутся уже с этой покупки."),
}
NAMES = ["Айжан", "Ерлан", "Мадина", "Сергей", "Динара", "Арман", "Ольга", "Бауыржан", "Жанна", "Игорь", "Камила", "Руслан"]


def hello(hour: int) -> str:
    return "Доброе утро" if hour < 12 else "Добрый день" if hour < 18 else "Добрый вечер"


def pick_request(week: int) -> dict:
    weights = [r["w"] * (COLD_SEASON[week] if r["group"] == "cold" else 1.0) for r in REQUESTS]
    return rnd.choices(REQUESTS, weights=weights)[0]


def visit(seller: str, store: str, hour: int, week: int, focus_on: bool) -> dict:
    """Один визит к кассе: реплики, просьба и наличие, допродажи, чек, этапы, возражения, нарушения."""
    st = dict(STYLE[seller])
    if seller == "dauren":
        st["offer"], st["generic"] = DAUREN_OFFER[week], DAUREN_GENERIC[week]
    trend = WEEK_TREND[week]
    peak = hour in PEAK
    offer_p = st["offer"] * trend * ((0.6 if seller == "timur" else 0.85) if peak else 1.0)
    S, C = "seller", "customer"
    lines: list[tuple[str, str]] = []
    offers: list[dict] = []
    items: list[tuple[str, int]] = []
    demand: list[dict] = []
    objections, violations = [], []
    steps = {"greet": 100, "needs": 100, "stock": 100, "complex": 0, "loyalty": 0, "advice": 40, "bye": 100}

    def offer(item, category, kind, technique, quote, accept_p, is_focus=False, amount=None):
        accepted = chance(accept_p * st["accept"])
        o = dict(item=item, category=category, kind=kind, technique=technique,
                 response="accepted" if accepted else "declined", is_focus=is_focus, quote=quote, customer_quote="",
                 amount=amount)
        offers.append(o)
        lines.append((S, quote))
        return o

    # Приветствие
    if chance(st["polite"]):
        lines.append((S, pick([f"{hello(hour)}! Чем могу помочь?", "Здравствуйте! Слушаю вас.", f"{hello(hour)}, подсказать что-нибудь?"])))
    else:
        lines.append((S, pick(["Слушаю.", "Да?", "Следующий."])))
        steps["greet"] = 40

    # Просьба покупателя
    req = pick_request(week)
    name, group = req["name"], req["group"]
    ask = pick(req["asks"] or [f"{name}, пожалуйста."])
    lines.append((C, ask))

    # Выяснение потребности: для кого, симптомы, рецепт
    no_prescription = req["rx"] and group == "abx" and chance(0.22)
    if req["rx"]:
        if no_prescription:
            lines.append((S, "Рецепт у вас есть?"))
            lines.append((C, pick(["Нет, рецепта нет. Врач по телефону сказал.", "Рецепта нет, мне в прошлый раз помогло."])))
        else:
            lines.append((S, pick(["Рецепт покажите, пожалуйста.", "Можно рецепт?"])))
            lines.append((C, "Да, вот."))
    elif group in ("cold", "kids", "pain") and chance(st["explain"] * 0.9):
        q, a = pick([("Для кого берёте — для взрослого или ребёнка?", pick(["Для себя.", "Для мужа.", "Для ребёнка, ему шесть лет."])),
                     ("Температура есть?", pick(["Тридцать семь и пять.", "Нет, только горло.", "Вчера была."])),
                     ("Давно беспокоит?", pick(["Со вчерашнего дня.", "Третий день уже."]))])
        lines.append((S, q))
        lines.append((C, a))
    else:
        steps["needs"] = 70 if not req["rx"] else 100

    # Рецептурный без рецепта: правильно — отказать; Тимур иногда отпускает
    if no_prescription:
        if chance(st.get("rx_slip", 0)):
            slip = "Ладно, дам одну упаковку, только в следующий раз с рецептом."
            lines.append((S, slip))
            violations.append(("Рецептурный препарат без рецепта", "high", slip,
                               "Отпустил антибиотик без рецепта по просьбе покупателя."))
            items.append((name, req["price"]))
        else:
            lines.append((S, pick(["Без рецепта не могу отпустить — это антибиотик. Сходите к врачу, а пока могу предложить спрей для горла.",
                                   "Это рецептурный препарат, без рецепта не отпускаем. Лучше показаться врачу."])))
            steps["advice"] = 100
            if chance(0.4):
                items.append(("Тантум Верде спрей", 2950))
                lines.append((C, "Ладно, давайте спрей."))
            else:
                lines.append((C, "Понятно, тогда схожу к врачу."))
        group = "cold" if items and items[0][0] == "Тантум Верде спрей" else group
    else:
        # Наличие
        mult = STORE_OOS.get(store, {}).get(name, 1.0) * (COLD_SEASON[week] if name in COLD_ITEMS else 1.0)
        missing = req["nc"] or chance(req["oos"] * mult)
        if missing:
            reason = "not_carried" if req["nc"] else "out_of_stock"
            sq = (pick([f"{name} мы не держим, к сожалению.", f"Такого у нас нет в ассортименте."]) if req["nc"]
                  else pick([f"{name} сейчас нет, закончился.", f"К сожалению, {name} закончился, ждём поставку.", "Сейчас нет в наличии."]))
            lines.append((S, sq))
            outcome, analog = "lost", None
            explained = chance(st["explain"])
            if req["analogs"] and chance(st["analog"]):
                a_name, a_price, a_take = pick(req["analogs"])
                analog = a_name
                if explained:
                    lines.append((S, f"Есть {a_name} — {'то же действующее вещество, работает так же' if req['cat'] in ('otc', 'rx') else 'похожий по действию'}, "
                                     f"и стоит {tenge(a_price)} тенге."))
                else:
                    lines.append((S, f"Можете взять {a_name}."))
                if chance(a_take * (1.25 if explained else 0.75)):
                    outcome = "substituted"
                    lines.append((C, pick(["Хорошо, давайте его.", "Ну раз то же самое — давайте.", f"Давайте {a_name}."])))
                    items.append((a_name, a_price))
                else:
                    raw = pick([f"Нет, мне нужен именно {name}.", "Аналоги мне не помогают, спасибо.", "Нет, врач сказал этот."])
                    lines.append((C, raw))
                    resolved = False
                    if chance(st["order"]):
                        lines.append((S, f"Могу заказать {name} к завтрашнему дню — оставите номер, мы позвоним."))
                        if chance(0.7):
                            lines.append((C, "Да, давайте закажем. Плюс семь семьсот один…"))
                            outcome, resolved = "ordered", True
                        else:
                            lines.append((C, "Нет, спасибо, поищу в другой аптеке."))
                    objections.append(("analog_distrust", resolved, "Предложил заказ к нужному дню" if resolved else None, raw))
            elif chance(st["order"]) and not req["nc"]:
                lines.append((S, f"Могу заказать к завтрашнему утру. Оставите телефон?"))
                if chance(0.72):
                    lines.append((C, "Да, закажите, пожалуйста."))
                    outcome = "ordered"
                else:
                    lines.append((C, "Нет, мне сегодня нужно, поищу в другом месте."))
            else:
                lines.append((C, pick(["Жаль. Ладно, поищу в другой аптеке.", "Понятно, спасибо.", "Эх, ладно."])))
            steps["stock"] = 100 if (analog and explained) or outcome == "ordered" else 60 if analog else 20
            demand.append(dict(item=name, category=req["cat"], reason=reason, outcome=outcome, analog=analog, quote=ask, seller_quote=sq))
        else:
            items.append((name, req["price"]))
            # Беременность — повод предупредить о противопоказаниях
            if group == "cold" and name == "Терафлю Экстра" and chance(0.05):
                lines.append((C, "А мне можно? Я беременна, пятый месяц."))
                if chance(st.get("careless", 0)):
                    bad = "Да можно, ничего страшного, пейте."
                    lines.append((S, bad))
                    violations.append(("Нет предупреждения о противопоказаниях", "medium", bad,
                                       "Покупательница сказала о беременности, фармацевт не предупредил о противопоказаниях."))
                else:
                    lines.append((S, "При беременности Терафлю нельзя. Лучше спрей Аквамарис и промывание, а с температурой — к врачу."))
                    items[-1] = ("Аквамарис спрей", 2600)
                    steps["advice"] = 100

    # Опасный совет вместо врача (редко, новичок)
    if group in ("cold", "gi") and chance(st.get("harm", 0)):
        harm = "Да попейте антибиотик дня три, у нас без рецепта Азитромицин не дам, но дома у всех есть."
        lines.append((S, harm))
        violations.append(("Назначение лечения вместо врача", "high", harm, "Посоветовал антибиотик без осмотра врача."))

    # Допродажи — только если что-то покупают
    concrete = False
    if items:
        main_name, main_price = items[0]
        # Упаковка побольше
        if req["size"] and items[0][0] == name and chance(offer_p * 0.35):
            big, big_price = req["size"]
            diff = big_price - main_price
            technique, quote = pick([
                ("benefit", f"Возьмите упаковку побольше — {big.split('№')[-1] if '№' in big else 'большую'} штук выходит выгоднее, на курс хватит."),
                ("choice", f"Вам маленькую упаковку или большую? Большая на {tenge(diff)} тенге дороже, но таблеток вдвое больше."),
                ("specific", "Большую упаковку возьмёте?"),
            ])
            o = offer(big, "size", "upsell", technique, quote, {"benefit": 0.36, "choice": 0.3, "specific": 0.16}[technique], amount=diff)
            concrete = True
            if o["response"] == "accepted":
                o["customer_quote"] = pick(["Давайте большую.", "Да, давайте на курс."])
                items[0] = (big, big_price)
            else:
                o["customer_quote"] = pick(["Нет, маленькой хватит.", "Нет, мне пару штук только."])
            lines.append((C, o["customer_quote"]))

        # Сопутствующее к лечению
        cross = [x for x in CROSS.get(req["cross"] if items and items[0][0] == name else group, []) if x[0] != main_name]
        if cross and chance(offer_p):
            concrete = True
            c_name, c_price, what = pick(cross)
            technique = rnd.choices(["specific", "choice", "benefit", "promo"], weights=[3, 2, 3, 1])[0]
            alts = [x for x in cross if x[0] != c_name and x[2] != what]
            if technique == "choice" and not alts:
                technique = "benefit"  # выбирать не из чего: «омегу-3 или омегу-3?» — не выбор
            if technique == "specific":
                quote = f"{what[0].upper() + what[1:]} возьмёте?"
            elif technique == "choice":
                alt = pick(alts)
                quote = f"Вам {what} или {alt[2]}?"
            elif technique == "benefit":
                quote = f"К этому лучше взять {what} — {REASONS.get(what, 'так лечение пойдёт быстрее')}."
            else:
                quote = f"Сейчас акция: {what} со скидкой 15 процентов, если берёте вместе. Добавить?"
                c_price = round(c_price * 0.85 / 10) * 10
            o = offer(c_name, "other", "cross_sell", technique, quote, ACCEPT[technique], amount=c_price)
            if o["response"] == "accepted":
                o["customer_quote"] = pick(["Да, давайте.", "Хорошо, добавьте.", f"Давайте {what}."])
                items.append((c_name, c_price))
                lines.append((C, o["customer_quote"]))
            else:
                r = rnd.random()
                if group == "abx" and r < 0.35:
                    raw = "Врач ничего такого не говорил."
                    lines.append((C, raw))
                    resolved = chance(st["explain"] * 0.7)
                    if resolved:
                        lines.append((S, "Это не назначение, а поддержка, пока пьёте антибиотик. Решать вам."))
                    objections.append(("doctor_only", resolved, "Спокойно объяснил пользу и оставил выбор" if resolved else None, raw))
                    o["customer_quote"] = raw
                elif r < 0.25:
                    raw = pick(["Спрей дома есть.", "Это у меня уже есть."])
                    lines.append((C, raw))
                    objections.append(("already_have", True, "Спокойно принял отказ", raw))
                    o["customer_quote"] = raw
                elif r < 0.45:
                    raw = "Дороговато, не надо."
                    lines.append((C, raw))
                    resolved = chance(0.45)
                    if resolved:
                        lines.append((S, "Понимаю. Есть вариант дешевле — тоже хорошо помогает."))
                    objections.append(("price", resolved, "Предложил вариант дешевле" if resolved else None, raw))
                    o["customer_quote"] = raw
                else:
                    o["customer_quote"] = pick(["Нет, спасибо.", "Не надо.", "В другой раз."])
                    lines.append((C, o["customer_quote"]))
                if chance(st.get("pushy", 0)):
                    push = "Да возьмите, вы что, болеть хотите дальше? Все берут!"
                    lines.append((S, push))
                    lines.append((C, "Я же сказал — не надо."))
                    violations.append(("Давление после отказа", "medium", push, "После отказа повторно уговаривает и стыдит покупателя."))
        elif chance(st["generic"] / max(0.01, 1 - offer_p)):
            q = pick(["Что-нибудь ещё?", "Ещё что-то нужно?", "Это всё?"])
            o = dict(item="что-нибудь ещё", category="other", kind="cross_sell", technique="generic", response="declined",
                     is_focus=False, quote=q, customer_quote="", amount=None)
            offers.append(o)
            lines.append((S, q))
            if chance(ACCEPT["generic"]):
                o["response"], o["customer_quote"] = "accepted", "А, ещё пластырь дайте."
                items.append(("Пластырь бактерицидный", 450))
            else:
                o["customer_quote"] = pick(["Нет, всё.", "Всё, спасибо."])
            lines.append((C, o["customer_quote"]))
            steps["complex"] = 25
        if concrete:
            steps["complex"] = 100

        # Товар дня — витамин D3
        if focus_on and group in ("cold", "vitamins", "kids", "chronic") and chance(st["focus"] * trend * (0.6 if peak else 1.0)):
            technique, quote = pick([
                ("promo", "Сейчас на витамин D3 акция: вторая упаковка за полцены. Осенью солнца мало — добавить?"),
                ("benefit", "Осенью многие берут витамин D3 — солнца мало, а он поддерживает иммунитет. Возьмёте курс?"),
            ])
            o = offer(FOCUS[0], "promo", "cross_sell", technique, quote, {"promo": 0.3, "benefit": 0.32}[technique], is_focus=True,
                      amount=FOCUS[1])
            o["customer_quote"] = pick(["Давайте, возьму.", "Да, как раз хотела."]) if o["response"] == "accepted" else pick(["Нет, пью уже.", "Не сейчас."])
            if o["response"] == "accepted":
                items.append(FOCUS)
            lines.append((C, o["customer_quote"]))

        # Карта лояльности
        if chance(st["loyalty"] * (0.6 if peak else 1.0)):
            technique, q = pick([("specific", "Карта «Садыхан» есть? Бонусы начислю."),
                                 ("benefit", "Оформим карту «Садыхан»? С каждой покупки три процента возвращается бонусами.")])
            o = offer("карта лояльности", "loyalty", "cross_sell", technique, q, {"specific": 0.32, "benefit": 0.45}[technique])
            o["customer_quote"] = pick(["Да, вот карта.", "Давайте оформим.", "По номеру: семь семьсот один…"]) if o["response"] == "accepted" else "Нет, не надо."
            lines.append((C, o["customer_quote"]))
            steps["loyalty"] = 100

        # Как принимать и расчёт
        total = sum(p for _, p in items)
        if chance(st["explain"]):
            lines.append((S, pick(["Принимайте после еды, не больше трёх раз в день.", "Пить курсом пять дней, запивать водой.",
                                   "Спрей — три-четыре раза в день после еды.", "Если через три дня не станет лучше — обязательно к врачу."])))
            steps["advice"] = 100
        lines.append((S, f"С вас {tenge(total)} тенге. Картой или наличными?"))
        lines.append((C, pick(["Картой.", "Каспи QR можно?", "Наличными.", "Картой, пожалуйста."])))
    else:
        steps["complex"] = 0

    # Прощание
    if chance(st["polite"]):
        lines.append((S, pick(["Выздоравливайте!", "Будьте здоровы, ждём вас снова.", "Всего доброго, не болейте!"])))
    else:
        lines.append((S, "Следующий."))
        steps["bye"] = 50

    real = [o for o in offers if o["technique"] != "generic"]
    missed = better = None
    if items and not real:
        missed, better = MISSED.get(group, MISSED["care"])
    return dict(lines=lines, offers=offers, items=items, total=sum(p for _, p in items), steps=steps, objections=objections,
                violations=violations, demand=demand, missed=missed, better=better, group=group,
                offers_count=len(real), offers_accepted=sum(1 for o in real if o["response"] == "accepted"))


def timed(lines):
    out, t = [], 0
    for role, text in lines:
        dur = 650 + 60 * len(text) + rnd.randint(-120, 260)
        out.append((role, text, t, t + dur))
        t += dur + rnd.randint(250, 950)
    return out


def shift_staff(store: str, day_index: int) -> tuple[str, str]:
    """Дневная и вечерняя смена: двое из команды аптеки, по кругу."""
    team = STORES[store][1]
    if len(team) == 2:
        return (team[0], team[1]) if day_index % 2 == 0 else (team[1], team[0])
    off = day_index % 3
    a, b = [p for i, p in enumerate(team) if i != off]
    return (a, b) if (day_index // 3) % 2 == 0 else (b, a)


# Примеры решений по списку закупки — как будто руководитель уже работает со списком
DECISIONS = [
    ("Нурофен Экспресс 200 мг", "to_order", "Абая: держать минимум 40 упаковок, заканчивается к обеду"),
    ("Тест-полоски Accu-Chek Active", "ordered", "Заказано у поставщика, придут в четверг"),
    ("Аквамарис спрей", "ignored", "Закрываем аналогом: Аквалор берут охотно"),
]


async def main():
    import asyncpg
    dsn = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    stores = {r["id"]: r for r in await conn.fetch("SELECT id, name FROM admin_schema.stores WHERE organization_id = $1", ORG)}
    sellers = {r["id"]: r for r in await conn.fetch("SELECT id, store_id, first_name FROM admin_schema.sellers WHERE organization_id = $1", ORG)}
    tpl = await conn.fetchrow("""SELECT id, name FROM scripts.script_templates WHERE organization_id = $1 AND is_active
                                 AND name LIKE 'Скрипт фармацевта%' ORDER BY created_at LIMIT 1""", ORG)
    assert tpl, "нет скрипта фармацевта — сначала install_pack.py"
    steps = await conn.fetch("SELECT id, name, weight, step_order FROM scripts.script_steps WHERE template_id = $1 ORDER BY step_order", tpl["id"])
    rules = {r["title"]: r["id"] for r in await conn.fetch("SELECT id, title FROM scripts.compliance_rules WHERE organization_id = $1", ORG)}
    store_id = {k: uuid.uuid5(NS, f"store:{k}") for k in STORES}
    seller_id = {k: uuid.uuid5(NS, f"seller:{k}") for k in STYLE}
    assert all(s in stores for s in store_id.values()) and all(s in sellers for s in seller_id.values()), "нет аптек или фармацевтов демо"
    step_key = {"Приветствие": "greet", "Выяснение потребности": "needs", "Наличие и аналог": "stock",
                "Комплексное предложение": "complex", "Карта лояльности": "loyalty",
                "Рекомендации по приёму и расчёт": "advice", "Прощание": "bye"}

    rec_rows, tr_rows, seg_rows, conv_rows, res_rows, score_rows, obj_rows, vio_rows, off_rows, dem_rows = ([] for _ in range(10))
    stats = defaultdict(Counter)
    demand_stats = Counter()
    start = TODAY - timedelta(days=DAYS - 1)
    for d in range(DAYS):
        day = start + timedelta(days=d)
        week = min(3, d // 7)
        weekend = day.weekday() >= 5
        focus_on = d >= DAYS - 21
        for store, (per_day, _team) in STORES.items():
            n = round(per_day * (0.85 if weekend else 1.0) * (1.0 + 0.05 * week) * rnd.uniform(0.92, 1.08))
            day_shift, evening = shift_staff(store, (day - date(2026, 1, 1)).days)
            hours = rnd.choices(list(HOUR_WEIGHTS), weights=list(HOUR_WEIGHTS.values()), k=n)
            for hour in sorted(hours):
                minute = rnd.randint(0, 59)
                if day == TODAY and (hour, minute) >= (UNTIL.hour, UNTIL.minute):
                    continue
                seller = day_shift if hour < 15 else evening
                sc = visit(seller, store, hour, week, focus_on)
                started = datetime.combine(day, time(hour, minute, rnd.randint(0, 59)), ALMATY)
                segs = timed(sc["lines"])
                duration = (segs[-1][3] + 999) // 1000
                rec, tr, conv = uid(), uid(), uid()
                rec_rows.append((rec, ORG, store_id[store], seller_id[seller], uuid.uuid5(NS, f"badge:{seller}"), day, started,
                                 started + timedelta(seconds=duration), duration, f"transcript-only/{rec}", 0, "analyzed", "transcript"))
                tr_rows.append((tr, rec, ORG, store_id[store], seller_id[seller], "\n".join(s[1] for s in segs), "ru", duration, "diarized", "demo"))
                for i, (role, text, s_ms, e_ms) in enumerate(segs):
                    seg_rows.append((uid(), tr, role, text, s_ms, e_ms, i))
                seller_ms = sum(e - s for r, _, s, e in segs if r == "seller")
                all_ms = sum(e - s for _, _, s, e in segs)
                score = sum(float(st["weight"]) * sc["steps"][step_key.get(st["name"], "complex")] for st in steps)
                bought = bool(sc["items"])
                order_items = [n for n, _ in sc["items"]]
                if bought:
                    topic = " + ".join(order_items[:3])
                    outcome = "purchase"
                else:
                    dm = sc["demand"][0] if sc["demand"] else None
                    topic = (f"{dm['item']}: заказ под покупателя" if dm["outcome"] == "ordered" else f"{dm['item']}: ушёл без покупки") if dm else "Консультация"
                    outcome = "deferred" if dm and dm["outcome"] == "ordered" else "competitor" if dm else "deferred"
                conv_rows.append((conv, rec, tr, ORG, store_id[store], seller_id[seller], day, Decimal(f"{score:.2f}"), outcome,
                                  Decimal("0.93"), topic, Decimal(f"{rnd.uniform(0.2, 0.65):.3f}"), started + timedelta(seconds=duration + 150),
                                  "demo", "analyzed", True, None,
                                  Decimal(f"{seller_ms / all_ms:.3f}"), 0, max(e - s for r, _, s, e in segs if r == "seller") // 1000,
                                  Decimal(f"{rnd.uniform(0.05, 0.14):.3f}"),
                                  bought, sc["offers_count"] if bought else 0, sc["offers_accepted"] if bought else 0,
                                  Decimal(sc["total"]) if bought else None, json.dumps(order_items, ensure_ascii=False) if bought else None,
                                  sc["missed"], sc["better"]))
                res_rows.append((uid(), conv, tpl["id"], tpl["name"], True, Decimal(f"{score:.2f}"), []))
                for st in steps:
                    k = step_key.get(st["name"], "complex")
                    score_rows.append((uid(), conv, tpl["id"], st["id"], st["name"], st["weight"], Decimal(sc["steps"][k]), sc["steps"][k] > 0))
                for i, (typ, resolved, technique, raw) in enumerate(sc["objections"]):
                    obj_rows.append((uid(), conv, typ, resolved, technique, raw, i))
                for i, (title, severity, evidence, explanation) in enumerate(sc["violations"]):
                    if title in rules:
                        vio_rows.append((uid(), conv, rules[title], title, severity, evidence, explanation, i))
                if bought:
                    for i, o in enumerate(sc["offers"]):
                        off_rows.append((uid(), conv, o["item"], o["category"], o["kind"], o["technique"], o["response"], o["is_focus"],
                                         o["quote"], o["customer_quote"], Decimal(o["amount"]) if o.get("amount") else None, i))
                for i, dm in enumerate(sc["demand"]):
                    dem_rows.append((uid(), conv, dm["item"], demand_key(dm["item"]), dm["category"], dm["reason"], dm["outcome"],
                                     dm["analog"], dm["quote"], dm["seller_quote"], i))
                    demand_stats[(dm["item"], dm["outcome"])] += 1
                s = stats[seller]
                s["visits"] += 1
                s["orders"] += bought
                s["with_offer"] += bought and sc["offers_count"] > 0
                s["offers"] += sc["offers_count"] if bought else 0
                s["accepted"] += sc["offers_accepted"] if bought else 0
                s["demand"] += len(sc["demand"])
                s["lost"] += sum(1 for dm in sc["demand"] if dm["outcome"] == "lost")

    print(f"{len(conv_rows)} визитов, {len(seg_rows)} реплик, {len(off_rows)} предложений, {len(dem_rows)} просьб без товара, "
          f"{len(obj_rows)} возражений, {len(vio_rows)} нарушений")
    for k, s in sorted(stats.items(), key=lambda kv: -kv[1]["with_offer"] / max(1, kv[1]["orders"])):
        print(f"  {k:8} покупок {s['orders']:4}  предлагали {s['with_offer'] / max(1, s['orders']):.0%}  "
              f"согласились {s['accepted'] / max(1, s['offers']):.0%}  спрос {s['demand']:3} (ушли {s['lost']})")
    top = Counter()
    for (item, _), n in demand_stats.items():
        top[item] += n
    print("  чаще всего не было:", ", ".join(f"{i} ×{n}" for i, n in top.most_common(8)))
    if DRY:
        return

    async with conn.transaction():
        await conn.execute("DELETE FROM analytics.seller_tips WHERE organization_id = $1", ORG)
        await conn.execute("DELETE FROM analytics.conversations WHERE organization_id = $1", ORG)
        await conn.execute("DELETE FROM transcription.transcripts WHERE organization_id = $1", ORG)
        await conn.execute("DELETE FROM recorder.recordings WHERE organization_id = $1", ORG)
        await conn.copy_records_to_table("recordings", schema_name="recorder", records=rec_rows, columns=[
            "id", "organization_id", "store_id", "seller_id", "device_id", "session_date", "started_at", "ended_at",
            "duration_seconds", "audio_path", "file_size_bytes", "status", "source"])
        await conn.copy_records_to_table("transcripts", schema_name="transcription", records=tr_rows, columns=[
            "id", "recording_id", "organization_id", "store_id", "seller_id", "full_text", "language", "duration_seconds", "status", "whisper_model"])
        await conn.copy_records_to_table("transcript_segments", schema_name="transcription", records=seg_rows, columns=[
            "id", "transcript_id", "speaker_role", "text", "start_ms", "end_ms", "segment_index"])
        await conn.copy_records_to_table("conversations", schema_name="analytics", records=conv_rows, columns=[
            "id", "recording_id", "transcript_id", "organization_id", "store_id", "seller_id", "session_date", "overall_score", "outcome",
            "outcome_confidence", "topic", "sentiment_avg", "analyzed_at", "llm_model", "status", "is_scorable", "has_upsell",
            "talk_ratio", "interruptions_count", "longest_monologue_seconds", "silence_ratio",
            "offer_opportunity", "offers_count", "offers_accepted", "check_total", "order_items", "offer_missed", "offer_better_phrase"])
        await conn.copy_records_to_table("conversation_script_results", schema_name="analytics", records=res_rows, columns=[
            "id", "conversation_id", "script_template_id", "script_name", "was_applied", "script_score", "violations"])
        await conn.copy_records_to_table("conversation_scores", schema_name="analytics", records=score_rows, columns=[
            "id", "conversation_id", "script_template_id", "script_step_id", "step_name", "step_weight", "score", "step_detected"])
        await conn.copy_records_to_table("objections", schema_name="analytics", records=obj_rows, columns=[
            "id", "conversation_id", "type", "is_resolved", "resolution_technique", "raw_text", "sort_order"])
        await conn.copy_records_to_table("conversation_compliance_violations", schema_name="analytics", records=vio_rows, columns=[
            "id", "conversation_id", "rule_id", "rule_title", "severity", "evidence", "explanation", "sort_order"])
        await conn.copy_records_to_table("conversation_offers", schema_name="analytics", records=off_rows, columns=[
            "id", "conversation_id", "item", "category", "kind", "technique", "response", "is_focus", "quote", "customer_quote", "amount", "sort_order"])
        await conn.copy_records_to_table("conversation_demand", schema_name="analytics", records=dem_rows, columns=[
            "id", "conversation_id", "item", "item_key", "category", "reason", "outcome", "analog", "quote", "seller_quote", "sort_order"])
        for title, status, note in DECISIONS:
            await conn.execute("""
                INSERT INTO analytics.demand_items (organization_id, item_key, title, status, note, updated_at)
                VALUES ($1, $2, $3, $4, $5, now() - interval '2 days')
                ON CONFLICT (organization_id, item_key) DO NOTHING
            """, ORG, demand_key(title), title, status, note)
    await conn.close()
    print("записано")


asyncio.run(main())
