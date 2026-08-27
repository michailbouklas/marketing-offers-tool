from __future__ import annotations

import numpy as np
import pytest
from forecast_service.backtest import (
    compute_metrics,
    grade_for_wape,
    holdout_length,
    run_backtest,
)
from forecast_service.models.base import RunContext
from forecast_service.models.registry import get_model
from forecast_service.preprocess import preprocess


def test_metric_math() -> None:
    y = np.array([100.0, 200.0, 0.0, 100.0])
    yhat = np.array([110.0, 180.0, 10.0, 100.0])
    lo = yhat - 15
    hi = yhat + 15
    m = compute_metrics(y, yhat, lo, hi, holdout_days=4, folds=1)
    assert m is not None
    # |e| = 10 + 20 + 10 + 0 = 40 over sum|y| = 400
    assert m.wape_pct == 10.0
    # MAPE only over y > 0: (10/100 + 20/200 + 0/100) / 3
    assert m.mape_pct == pytest.approx(6.67, abs=0.01)
    assert m.mae == 10.0
    # signed: (+10 - 20 + 10 + 0) / 400
    assert m.bias_pct == 0.0
    # bands are yhat +/- 15: 200 vs [165, 195] is the only miss -> 3 of 4 covered
    assert m.coverage80_pct == 75.0
    assert m.grade == "high"


def test_zero_actuals_give_no_metrics() -> None:
    assert compute_metrics(np.zeros(3), np.ones(3), None, None, holdout_days=3, folds=1) is None


@pytest.mark.parametrize(
    ("wape", "grade"),
    [
        (0.0, "high"),
        (12.0, "high"),
        (12.01, "medium"),
        (25.0, "medium"),
        (25.01, "low"),
        (80, "low"),
    ],
)
def test_grade_thresholds(wape: float, grade: str) -> None:
    g, label = grade_for_wape(wape)
    assert g == grade
    assert label.endswith("confidence")


@pytest.mark.parametrize(
    ("horizon", "n", "expected"),
    [(30, 400, 28), (7, 400, 7), (30, 100, 20), (90, 60, 12), (14, 20, 4)],
)
def test_holdout_length(horizon: int, n: int, expected: int) -> None:
    assert holdout_length(horizon, n) == expected


def test_run_backtest_with_reference_model(series_120) -> None:
    series = preprocess(series_120, horizon=14)
    model = get_model("seasonal_naive")
    result = run_backtest(model, series, horizon=14, folds=1, ctx=RunContext(country=None))
    assert result is not None
    assert result.holdout_days == 14
    assert result.folds == 1
    assert 0 <= result.wape_pct < 30
    assert result.coverage80_pct is not None


def test_run_backtest_drops_folds_that_would_starve_training(series_120) -> None:
    series = preprocess(series_120, horizon=28)  # holdout 24; 120 - 3*24 = 48 < 56 -> 2 folds max
    model = get_model("seasonal_naive")
    result = run_backtest(model, series, horizon=28, folds=5, ctx=RunContext(country=None))
    assert result is not None
    assert result.folds == 2


def test_run_backtest_returns_none_when_disabled(series_120) -> None:
    series = preprocess(series_120, horizon=14)
    model = get_model("seasonal_naive")
    assert run_backtest(model, series, 14, 0, RunContext(country=None)) is None
