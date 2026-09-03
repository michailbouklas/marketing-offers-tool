"""``foundation`` (TimesFM 2.5). Model tests run only with the extra installed and
FORECAST_FOUNDATION_ENABLED=1; the registration guard is tested unconditionally."""

from __future__ import annotations

import numpy as np
import pytest
from forecast_service.core import run_forecast
from forecast_service.models import foundation_timesfm
from forecast_service.models.registry import list_models
from forecast_service.schemas import ForecastRequest, ModelInfoSchema

from tests.conftest import FOUNDATION_ENABLED

needs_model = pytest.mark.skipif(
    not FOUNDATION_ENABLED,
    reason="needs `uv sync --extra foundation` and FORECAST_FOUNDATION_ENABLED=1",
)


def test_registered_only_when_enabled() -> None:
    ids = {m.id for m in list_models()}
    assert ("foundation" in ids) is FOUNDATION_ENABLED


def test_is_available_false_when_flag_off(monkeypatch) -> None:
    monkeypatch.setenv("FORECAST_FOUNDATION_ENABLED", "0")
    assert foundation_timesfm.is_available() is False


def test_heavy_flag_is_not_on_the_wire() -> None:
    info = foundation_timesfm.FoundationModel.info
    assert info.heavy is True
    wire = ModelInfoSchema.model_validate(
        {k: v for k, v in info.__dict__.items()}
    ).model_dump(by_alias=True)
    assert "heavy" not in wire and "sortOrder" not in wire and "internal" not in wire


@pytest.fixture(scope="module")
def result(series_430):
    if not FOUNDATION_ENABLED:
        pytest.skip("foundation model not available")
    return run_forecast(
        ForecastRequest(
            model_id="foundation", horizon_days=14, backtest_folds=1, country="CY",
            series=series_430,
        )
    )


@needs_model
def test_95_band_is_wider_than_80(result) -> None:
    for p in result.forecast:
        assert p.lo95 <= p.lo80 <= p.yhat <= p.hi80 <= p.hi95
    widths80 = [p.hi80 - p.lo80 for p in result.forecast]
    widths95 = [p.hi95 - p.lo95 for p in result.forecast]
    assert sum(widths95) > sum(widths80) > 0


@needs_model
def test_fitted_is_a_rolling_replay(result) -> None:
    # 430 days -> 24 two-week windows -> the last 336 days carry a fitted value; earlier NaN.
    fitted = [h.fitted for h in result.history]
    assert len(fitted) == 365
    assert all(f is None for f in fitted[:29])
    assert all(f is not None and f >= 0 for f in fitted[29:])


@needs_model
def test_flags_and_notes(result) -> None:
    assert result.seasonality.holidays_used is False
    assert result.seasonality.yearly_seasonality_used is True
    assert any("Zero-shot" in n for n in result.seasonality.notes)


@needs_model
def test_rolling_fitted_short_series_is_all_nan() -> None:
    model = foundation_timesfm._load()
    y = np.full(100, 100.0, dtype=np.float32)  # 100 - 90 < 14 -> no window fits
    fitted = foundation_timesfm._rolling_fitted(model, y)
    assert np.isnan(fitted).all()
