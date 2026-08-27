from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest
from forecast_service.errors import ForecastError
from forecast_service.preprocess import (
    MIN_HISTORY_DAYS,
    YEARLY_MIN_DAYS,
    preprocess,
)
from forecast_service.schemas import SeriesPoint

START = date(2024, 1, 1)


def daily(
    values: list[float], start: date = START, skip: set[int] | None = None
) -> list[SeriesPoint]:
    skip = skip or set()
    return [
        SeriesPoint(ds=start + timedelta(days=i), y=v)
        for i, v in enumerate(values)
        if i not in skip
    ]


def codes(series) -> set[str]:
    return {w.code for w in series.warnings}


def test_gaps_are_zero_filled_and_flagged() -> None:
    values = [100.0] * 70
    s = preprocess(daily(values, skip={10, 11, 40}), horizon=7)
    assert s.n_days == 70
    assert s.y[10] == 0 and s.y[11] == 0 and s.y[40] == 0
    assert "GAPS_FILLED" in codes(s)
    gap = next(w for w in s.warnings if w.code == "GAPS_FILLED")
    assert gap.details == {"filledDays": 3, "trimmedLeadingDays": 0}
    # short gaps are not closures
    assert not s.closure_mask.any()


def test_closure_run_is_nan_for_prophet_and_interpolated_for_stats() -> None:
    values = [100.0] * 30 + [0.0] * 8 + [200.0] * 30
    s = preprocess(daily(values), horizon=7)
    assert s.closure_mask[30:38].all() and s.closure_mask.sum() == 8
    assert np.isnan(s.y_nan_closures[30:38]).all()
    assert np.isfinite(s.y_interp).all()
    # linear between 100 and 200
    assert 100 < s.y_interp[31] < s.y_interp[36] < 200
    assert s.y[33] == 0  # raw view keeps the zeros
    assert "CLOSURE_PERIOD" in codes(s)


def test_six_zero_days_are_not_a_closure() -> None:
    values = [100.0] * 30 + [0.0] * 6 + [100.0] * 30
    s = preprocess(daily(values), horizon=7)
    assert not s.closure_mask.any()
    assert "CLOSURE_PERIOD" not in codes(s)


def test_negatives_are_clipped() -> None:
    values = [100.0] * 60
    values[5] = -40.0
    s = preprocess(daily(values), horizon=7)
    assert s.y[5] == 0
    assert "NEGATIVE_CLIPPED" in codes(s)


def test_leading_zero_days_are_trimmed() -> None:
    values = [0.0] * 10 + [100.0] * 60
    s = preprocess(daily(values), horizon=7)
    assert s.n_days == 60
    assert s.ds[0].date() == START + timedelta(days=10)


def test_outlier_is_flagged_not_removed() -> None:
    rng = np.random.default_rng(1)
    values = list(100.0 + rng.normal(0, 3, 90))
    values[45] = 900.0
    s = preprocess(daily(values), horizon=7)
    assert s.outlier_mask[45]
    assert s.y[45] == 900.0
    assert "OUTLIERS_DETECTED" in codes(s)


def test_minimum_history_is_enforced() -> None:
    with pytest.raises(ForecastError) as exc:
        preprocess(daily([100.0] * (MIN_HISTORY_DAYS - 1)), horizon=7)
    assert exc.value.code == "INSUFFICIENT_HISTORY"
    assert exc.value.http_status == 422
    assert exc.value.details == {"days": MIN_HISTORY_DAYS - 1, "required": MIN_HISTORY_DAYS}
    preprocess(daily([100.0] * MIN_HISTORY_DAYS), horizon=7)  # exactly enough


def test_yearly_toggle_at_400_days() -> None:
    short = preprocess(daily([100.0] * (YEARLY_MIN_DAYS - 1)), horizon=7)
    assert not short.yearly_ok
    assert "INSUFFICIENT_FOR_YEARLY" in codes(short)
    enough = preprocess(daily([100.0] * YEARLY_MIN_DAYS), horizon=7)
    assert enough.yearly_ok
    assert "INSUFFICIENT_FOR_YEARLY" not in codes(enough)


def test_long_horizon_warning() -> None:
    s = preprocess(daily([100.0] * 60), horizon=30)
    assert "HORIZON_LONG_FOR_HISTORY" in codes(s)
    s2 = preprocess(daily([100.0] * 120), horizon=30)
    assert "HORIZON_LONG_FOR_HISTORY" not in codes(s2)


@pytest.mark.parametrize(
    "points",
    [
        [SeriesPoint(ds=START + timedelta(days=1), y=1.0), SeriesPoint(ds=START, y=1.0)],
        [SeriesPoint(ds=START, y=1.0), SeriesPoint(ds=START, y=2.0)],
        [SeriesPoint(ds=START, y=float("nan"))],
        [SeriesPoint(ds=START, y=0.0)] * 1,
    ],
)
def test_invalid_series(points: list[SeriesPoint]) -> None:
    with pytest.raises(ForecastError) as exc:
        preprocess(points, horizon=7)
    assert exc.value.code == "INVALID_SERIES"


def test_orders_are_carried_when_present() -> None:
    pts = [SeriesPoint(ds=START + timedelta(days=i), y=100.0, orders=10) for i in range(60)]
    s = preprocess(pts, horizon=7)
    assert s.orders is not None and s.orders[0] == 10
    s2 = preprocess(daily([100.0] * 60), horizon=7)
    assert s2.orders is None


def test_head_slices_every_array() -> None:
    s = preprocess(daily([100.0] * 80), horizon=7)
    h = s.head(60)
    assert h.n_days == 60 and len(h.ds) == 60 and len(h.closure_mask) == 60
    assert h.cutoff == s.ds[59]
    assert h.warnings == []
