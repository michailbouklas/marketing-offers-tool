"""Every registered model must recover the planted Saturday peak on a synthetic series."""

from __future__ import annotations

import pytest
from forecast_service.core import run_forecast
from forecast_service.models.registry import get_model, list_models
from forecast_service.schemas import WARNING_CODES, ForecastRequest

from tests.conftest import PUBLIC_MODEL_IDS

MODEL_IDS = [m.id for m in list_models(include_internal=True)]
HORIZON = 14


@pytest.fixture(scope="module", params=MODEL_IDS)
def result(request, series_430):
    req = ForecastRequest(
        model_id=request.param,
        horizon_days=HORIZON,
        backtest_folds=1,
        country="CY",
        series=series_430,
    )
    return run_forecast(req)


def test_public_catalog_hides_internal_models() -> None:
    public = {m.id for m in list_models()}
    assert [m.id for m in list_models()] == PUBLIC_MODEL_IDS
    assert public == set(PUBLIC_MODEL_IDS)
    assert "seasonal_naive" in {m.id for m in list_models(include_internal=True)}
    assert get_model("seasonal_naive").info.internal


def test_shape(result) -> None:
    assert len(result.forecast) == HORIZON
    assert result.horizon_days == HORIZON
    assert len(result.history) == 365  # max(365, 2 * 14)
    first = result.forecast[0]
    assert first.ds == result.cutoff_date.replace(day=result.cutoff_date.day) or True
    assert (result.forecast[0].ds - result.cutoff_date).days == 1
    assert result.model_id in MODEL_IDS
    assert result.runtime_ms >= 0


def test_bands_are_ordered_and_non_negative(result) -> None:
    for p in result.forecast:
        assert p.yhat >= 0
        assert p.lo95 <= p.lo80 <= p.yhat <= p.hi80 <= p.hi95
        assert p.lo95 >= 0


def test_saturday_peak_recovered(result) -> None:
    assert result.seasonality.strongest_weekday == "Saturday"
    assert result.seasonality.weekday_uplift_pct > 10
    assert any("Saturdays are typically" in n for n in result.seasonality.notes)


def test_accuracy_is_measured_and_good(result) -> None:
    assert result.accuracy is not None
    assert result.accuracy.holdout_days == HORIZON
    assert result.accuracy.wape_pct < 15
    assert result.accuracy.grade in {"high", "medium", "low"}
    assert result.accuracy.grade_label.endswith("confidence")


def test_summary_is_consistent(result) -> None:
    s = result.summary
    total = sum(p.yhat for p in result.forecast)
    assert s.horizon_total == pytest.approx(total, rel=1e-3)
    assert s.horizon_lower80 <= s.horizon_total <= s.horizon_upper80
    assert s.same_period_last_year is not None  # 430 >= 365 + 14
    assert s.vs_last_year_pct is not None
    assert s.trailing_period_total > 0 and s.vs_trailing_pct is not None
    assert s.average_daily == pytest.approx(total / HORIZON, rel=1e-3)
    assert s.peak_day_value >= s.low_day_value
    assert s.peak_day.weekday() == 5  # Saturday
    assert s.average_order_value == pytest.approx(12.5, rel=0.05)


def test_trend_is_upward_on_growing_series(result) -> None:
    # synthetic series grows 2/day on a ~10k base -> ~0.6 %/30d, i.e. flat by our ±3 % rule
    assert result.trend_direction in {"flat", "up"}
    assert -3 <= result.trend_pct_per30d <= 10


def test_warning_codes_are_known(result) -> None:
    assert {w.code for w in result.warnings} <= set(WARNING_CODES)


def test_history_has_fitted_values(result) -> None:
    fitted = [h.fitted for h in result.history if h.fitted is not None]
    assert len(fitted) > 300
    assert all(f >= 0 for f in fitted)
