from decimal import Decimal


def validate_weights_sum(weights: list[float]) -> bool:
    """True if sum of weights equals 1.000 with 0.001 tolerance"""
    if not weights:
        return False
    total = sum(Decimal(str(w)) for w in weights)
    return total == Decimal("1.000")
