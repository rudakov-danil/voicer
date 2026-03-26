import pytest
from app.scorer import calculate_script_score, calculate_overall_score


def test_calculate_script_score_weighted():
    """AN-U-01: weighted sum with 3 steps"""
    steps = [
        {"id": "a", "weight": 0.15},
        {"id": "b", "weight": 0.50},
        {"id": "c", "weight": 0.35},
    ]
    scores = [
        {"step_id": "a", "score": 100.0},
        {"step_id": "b", "score": 70.0},
        {"step_id": "c", "score": 80.0},
    ]
    # (0.15*100 + 0.50*70 + 0.35*80) / 1.0 * 100 = (15 + 35 + 28) = 78.0
    # But weights sum to 1.0, so result = 0.15*100 + 0.50*70 + 0.35*80 = 78.0
    result = calculate_script_score(scores, steps)
    assert result == 78.0


def test_calculate_script_score_missing_step():
    """AN-U-02: LLM skipped a step → score=0 for it"""
    steps = [
        {"id": "a", "weight": 0.50},
        {"id": "b", "weight": 0.50},
    ]
    scores = [
        {"step_id": "a", "score": 80.0},
        # step b is missing
    ]
    # (0.50*80 + 0.50*0) / 1.0 * 100 = 40.0
    result = calculate_script_score(scores, steps)
    assert result == 40.0


def test_calculate_overall_score():
    """AN-U-03: average of two scripts"""
    result = calculate_overall_score([82.0, 70.0])
    assert result == 76.0


def test_calculate_overall_score_empty():
    """AN-U-04: empty → None"""
    assert calculate_overall_score([]) is None
