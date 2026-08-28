"""``calendar_boost``: holiday-distance features and the calendar effects they let it learn."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from forecast_service.core import run_forecast
from forecast_service.holidays_util import holidays_for
from forecast_service.models.calendar_boost import (
    HOLIDAY_WINDOW_DAYS,
    YEARLY_MIN_DAYS,
    holiday_features,
)
from forecast_service.schemas import ForecastRequest, SeriesPoint
from forecast_service.warmup import synthetic_series

MODEL = "calendar_boost"
EVE_UPLIFT = 1.5


def _features(table: dict[date, str], dates: pd.DatetimeIndex) -> dict[str, np.ndarray]:
    return {f.__name__: np.asarray(f(dates)) for f in holiday_features(table)}


def test_holiday_features_measure_distance_eve_and_bridge() -> None:
    # Thursday 2024-03-28 is the only holiday: Friday 29th is a bridge day, Wednesday 27th the eve.
    table = {date(2024, 3, 28): "Test Day"}
    dates = pd.date_range("2024-03-18", "2024-04-08", freq="D")
    feats = _features(table, dates)
    by_day = {d.date(): i for i, d in enumerate(dates)}

    assert feats["is_holiday"][by_day[date(2024, 3, 28)]] == 1
    assert feats["is_holiday"].sum() == 1
    assert feats["is_holiday_eve"][by_day[date(2024, 3, 27)]] == 1
    assert feats["is_holiday_eve"].sum() == 1
    assert feats["is_bridge_day"][by_day[date(2024, 3, 29)]] == 1
    assert feats["is_bridge_day"].sum() == 1
    assert feats["days_to_holiday"][by_day[date(2024, 3, 25)]] == 3
    assert feats["days_since_holiday"][by_day[date(2024, 3, 30)]] == 2
    # Capped at the window on both sides.
    assert feats["days_to_holiday"][by_day[date(2024, 3, 18)]] == HOLIDAY_WINDOW_DAYS
    assert feats["days_since_holiday"][by_day[date(2024, 4, 8)]] == HOLIDAY_WINDOW_DAYS
    assert feats["days_to_holiday"][by_day[date(2024, 4, 8)]] == HOLIDAY_WINDOW_DAYS


def test_holiday_features_with_empty_table_are_neutral() -> None:
    dates = pd.date_range("2024-01-01", periods=10, freq="D")
    feats = _features({}, dates)
    assert (feats["days_to_holiday"] == HOLIDAY_WINDOW_DAYS).all()
    assert (feats["days_since_holiday"] == HOLIDAY_WINDOW_DAYS).all()
    assert feats["is_holiday"].sum() == 0
    assert feats["is_bridge_day"].sum() == 0


def _with_eve_uplift(points: list[SeriesPoint], eves: set[date]) -> list[SeriesPoint]:
    return [
        SeriesPoint(ds=p.ds, y=round(p.y * EVE_UPLIFT, 2) if p.ds in eves else p.y, orders=p.orders)
        for p in points
    ]


def test_recovers_planted_holiday_eve_uplift() -> None:
    horizon = 30
    plain = synthetic_series(days=800)
    years = range(plain[0].ds.year, (plain[-1].ds + timedelta(days=horizon)).year + 1)
    table = holidays_for("CY", years)
    assert table
    eves = {d - timedelta(days=1) for d in table}
    planted = _with_eve_uplift(plain, eves)

    def forecast(points: list[SeriesPoint]) -> dict[date, float]:
        result = run_forecast(
            ForecastRequest(
                model_id=MODEL, horizon_days=horizon, backtest_folds=0, country="CY", series=points
            )
        )
        assert result.seasonality.holidays_used
        return {p.ds: p.yhat for p in result.forecast}

    with_uplift = forecast(planted)
    without = forecast(plain)
    future_eves = [d for d in with_uplift if d in eves]
    assert future_eves, "the 30-day window must contain at least one holiday eve"
    for eve in future_eves:
        assert with_uplift[eve] / without[eve] > 1.2, eve
    quiet = [d for d in with_uplift if d not in eves and d not in table]
    ratios = np.array([with_uplift[d] / without[d] for d in quiet])
    assert np.median(ratios) < 1.1


def test_country_none_skips_holidays_without_warning(series_430, monkeypatch) -> None:
    # The engine falls back to FORECAST_DEFAULT_COUNTRY when the request omits `country`.
    monkeypatch.setenv("FORECAST_DEFAULT_COUNTRY", "")
    result = run_forecast(
        ForecastRequest(model_id=MODEL, horizon_days=7, backtest_folds=0, series=series_430)
    )
    assert not result.seasonality.holidays_used
    assert "HOLIDAYS_UNAVAILABLE" not in {w.code for w in result.warnings}


def test_unsupported_country_warns(series_430) -> None:
    result = run_forecast(
        ForecastRequest(
            model_id=MODEL, horizon_days=7, backtest_folds=0, country="ZZ", series=series_430
        )
    )
    assert not result.seasonality.holidays_used
    assert "HOLIDAYS_UNAVAILABLE" in {w.code for w in result.warnings}


def test_yearly_lag_needs_two_years(series_430) -> None:
    short = run_forecast(
        ForecastRequest(model_id=MODEL, horizon_days=7, backtest_folds=0, series=series_430)
    )
    assert not short.seasonality.yearly_seasonality_used
    long = run_forecast(
        ForecastRequest(
            model_id=MODEL,
            horizon_days=7,
            backtest_folds=0,
            series=synthetic_series(days=YEARLY_MIN_DAYS + 30),
        )
    )
    assert long.seasonality.yearly_seasonality_used
    assert all(h.fitted is not None for h in long.history)


def test_minimum_history_falls_back_to_residual_bands(series_120) -> None:
    result = run_forecast(
        ForecastRequest(model_id=MODEL, horizon_days=90, backtest_folds=0, series=series_120)
    )
    assert len(result.forecast) == 90
    for p in result.forecast:
        assert p.lo95 <= p.lo80 <= p.yhat <= p.hi80 <= p.hi95
    assert result.summary.horizon_upper80 > result.summary.horizon_lower80
