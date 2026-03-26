import pytest
from app.validators import validate_weights_sum


def test_valid_three_weights():
    """SCRIPTS-U-01: [0.15, 0.50, 0.35] → True"""
    assert validate_weights_sum([0.15, 0.50, 0.35]) is True


def test_invalid_sum_095():
    """SCRIPTS-U-02: sum=0.95 → False"""
    assert validate_weights_sum([0.10, 0.25, 0.25, 0.20, 0.15]) is False


def test_valid_repeating_decimals():
    """SCRIPTS-U-03: [0.333, 0.333, 0.334] → True"""
    assert validate_weights_sum([0.333, 0.333, 0.334]) is True


def test_empty_list():
    """SCRIPTS-U-04: empty → False"""
    assert validate_weights_sum([]) is False
