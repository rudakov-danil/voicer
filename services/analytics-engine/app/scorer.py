from decimal import Decimal, ROUND_HALF_UP
from typing import Optional


def calculate_script_score(step_scores: list[dict], script_steps: list[dict]) -> float:
    """Weighted sum of step scores. Returns 0.0—100.0"""
    weights_map = {step["id"]: Decimal(str(step["weight"])) for step in script_steps}
    scores_map = {s["step_id"]: Decimal(str(s["score"])) for s in step_scores}

    total_weight = Decimal("0")
    weighted_sum = Decimal("0")
    for step_id, weight in weights_map.items():
        score = scores_map.get(step_id, Decimal("0"))
        weighted_sum += weight * score
        total_weight += weight

    if total_weight == Decimal("0"):
        return 0.0
    result = weighted_sum / total_weight
    return float(result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_overall_score(script_scores: list[float]) -> Optional[float]:
    """Average across all scripts. None if empty."""
    if not script_scores:
        return None
    avg = sum(script_scores) / len(script_scores)
    return round(avg, 2)
