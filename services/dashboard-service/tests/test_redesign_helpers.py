"""Чистые функции, на которых держатся новые блоки «Аналитики» и «Команды»."""
from app.routers.insights import _price_answer, _rate
from app.routers.sellers import _median
from app.routers.conversations import VIEW_CONDITIONS


def test_price_answer_groups_by_keywords():
    assert _price_answer("предложение программ с трейд-ин и кредитом", True) == "Трейд-ин"
    assert _price_answer("financing_options", True) == "Рассрочка или кредит"
    assert _price_answer("Сравнение с конкурентами и подсчёт затрат", True) == "Ценность и сравнение"
    assert _price_answer("уменьшение количества товаров в наборе", True) == "Вариант подешевле"
    assert _price_answer("пригласил на кофе", True) == "Другое"


def test_price_answer_without_technique():
    assert _price_answer(None, False) == "Нет ответа"
    assert _price_answer("   ", True) == "Нет ответа"


def test_rate_and_median():
    assert _rate(1, 4) == 25.0
    assert _rate(0, 0) is None
    assert _median([]) is None
    assert _median([3.0, 1.0, 2.0]) == 2.0
    assert _median([1.0, 2.0, 3.0, 4.0]) == 2.5


def test_low_score_view_excludes_violations():
    cond = VIEW_CONDITIONS["low_score"]
    assert ":threshold" in cond
    assert "NOT EXISTS" in cond
