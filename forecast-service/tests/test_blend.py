"""``blend``: averages its members and degrades gracefully when one cannot run."""

from __future__ import annotations

import numpy as np
import pytest
from forecast_service.backtest import LEVELS
from forecast_service.errors import ForecastError
from forecast_service.models import registry
from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.blend import MEMBERS, BlendModel
from forecast_service.preprocess import CleanSeries, preprocess

HORIZON = 14


class _Stub:
    def __init__(self, model_id: str, *, min_history_days: int = 0, fail: bool = False) -> None:
        self.info = ModelInfo(
            id=model_id,
            name=f"Stub {model_id}",
            description="",
            version="0",
            min_history_days=min_history_days,
            recommended_horizons=[7],
            supports_holidays=False,
        )
        self.fail = fail
        self.calls = 0

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        self.calls += 1
        if self.fail:
            raise RuntimeError("boom")
        yhat = np.full(horizon, 100.0)
        return ModelOutput(
            ds=[d.date() for d in series.future_index(horizon)],
            yhat=yhat,
            bands={lv: (yhat - lv, yhat + lv) for lv in level},
            fitted=np.full(series.n_days, 100.0),
            components=None,
            notes=[],
        )


@pytest.fixture
def clean_430(series_430) -> CleanSeries:
    return preprocess(series_430, HORIZON)


def test_blend_lies_between_its_members(clean_430) -> None:
    ctx = RunContext(country="CY", uncertainty_samples=60)
    members = [registry.get_model(m).fit_predict(clean_430, HORIZON, LEVELS, ctx) for m in MEMBERS]
    blend = BlendModel().fit_predict(clean_430, HORIZON, LEVELS, ctx)

    stack = np.vstack([m.yhat for m in members])
    assert np.all(blend.yhat >= stack.min(axis=0) - 1e-6)
    assert np.all(blend.yhat <= stack.max(axis=0) + 1e-6)
    assert list(blend.ds) == list(members[0].ds)
    assert blend.fitted is not None and np.isfinite(blend.fitted[-1])
    assert blend.notes and "Blend of 3 models" in blend.notes[0]
    assert blend.holidays_used and blend.yearly_seasonality_used
    assert not any(w.code == "FALLBACK_MODEL_USED" for w in ctx.warnings)


def test_failing_member_is_skipped_with_warning(clean_430, monkeypatch) -> None:
    good = _Stub("statistical_baseline")
    also_good = _Stub("seasonal_trend")
    bad = _Stub("calendar_boost", fail=True)
    for stub in (good, also_good, bad):
        monkeypatch.setitem(registry._REGISTRY, stub.info.id, stub)

    ctx = RunContext(country=None)
    out = BlendModel().fit_predict(clean_430, HORIZON, LEVELS, ctx)

    assert bad.calls == 1 and good.calls == 1
    assert np.allclose(out.yhat, 100.0)
    assert np.allclose(out.bands[80][0], 20.0) and np.allclose(out.bands[95][1], 195.0)
    warning = next(w for w in ctx.warnings if w.code == "FALLBACK_MODEL_USED")
    assert warning.details and warning.details["skipped"][0]["modelId"] == "calendar_boost"
    assert "RuntimeError" in warning.details["skipped"][0]["reason"]
    assert "Blend of 2 models" in out.notes[0]


def test_member_needing_more_history_is_skipped(clean_430, monkeypatch) -> None:
    hungry = _Stub("calendar_boost", min_history_days=10_000)
    monkeypatch.setitem(registry._REGISTRY, hungry.info.id, hungry)
    monkeypatch.setitem(registry._REGISTRY, "seasonal_trend", _Stub("seasonal_trend"))
    monkeypatch.setitem(registry._REGISTRY, "statistical_baseline", _Stub("statistical_baseline"))

    ctx = RunContext(country=None)
    BlendModel().fit_predict(clean_430, HORIZON, LEVELS, ctx)

    assert hungry.calls == 0
    warning = next(w for w in ctx.warnings if w.code == "FALLBACK_MODEL_USED")
    assert "needs 10000 days" in warning.details["skipped"][0]["reason"]


def test_fewer_than_two_members_is_model_failed(clean_430, monkeypatch) -> None:
    monkeypatch.setitem(registry._REGISTRY, "seasonal_trend", _Stub("seasonal_trend", fail=True))
    monkeypatch.setitem(registry._REGISTRY, "calendar_boost", _Stub("calendar_boost", fail=True))
    monkeypatch.setitem(registry._REGISTRY, "statistical_baseline", _Stub("statistical_baseline"))

    with pytest.raises(ForecastError) as excinfo:
        BlendModel().fit_predict(clean_430, HORIZON, LEVELS, RunContext(country=None))
    assert excinfo.value.code == "MODEL_FAILED"
