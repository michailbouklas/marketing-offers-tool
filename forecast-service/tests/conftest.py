"""Shared fixtures. Env is set before any settings object is built (settings read env per call)."""

from __future__ import annotations

import os
from datetime import date
from typing import Any

import pytest

# Keep Prophet's Monte-Carlo cheap and run the API executor in-process.
os.environ.setdefault("FORECAST_UNCERTAINTY_SAMPLES", "60")
os.environ.setdefault("FORECAST_ALLOW_NO_AUTH", "1")
os.environ.setdefault("FORECAST_INLINE_EXECUTOR", "1")
os.environ.setdefault("FORECAST_WORKERS", "2")
os.environ.setdefault("FORECAST_SERVICE_TOKEN", "")

from forecast_service.models.foundation_timesfm import is_available as foundation_available
from forecast_service.schemas import SeriesPoint
from forecast_service.warmup import synthetic_series

FOUNDATION_ENABLED = foundation_available()
"""True when FORECAST_FOUNDATION_ENABLED=1 and the ``foundation`` extra is installed; the
TimesFM tests and the extra catalog entry are gated on it so a plain checkout stays fast."""

PUBLIC_MODEL_IDS = ["seasonal_trend", "statistical_baseline", "calendar_boost", "blend"] + (
    ["foundation"] if FOUNDATION_ENABLED else []
)

TEST_ENV = {
    k: os.environ[k]
    for k in (
        "FORECAST_UNCERTAINTY_SAMPLES",
        "FORECAST_ALLOW_NO_AUTH",
        "FORECAST_INLINE_EXECUTOR",
        "FORECAST_WORKERS",
    )
}


def points_to_wire(points: list[SeriesPoint]) -> list[dict[str, Any]]:
    return [
        {"ds": p.ds.isoformat(), "y": p.y, **({"orders": p.orders} if p.orders is not None else {})}
        for p in points
    ]


def make_request(
    points: list[SeriesPoint], model_id: str = "seasonal_naive", horizon: int = 14, **extra: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "modelId": model_id,
        "horizonDays": horizon,
        "backtestFolds": 1,
        "seriesLabel": "test",
        "series": points_to_wire(points),
    }
    body.update(extra)
    return body


@pytest.fixture(scope="session")
def series_430() -> list[SeriesPoint]:
    """~14 months: enough for yearly seasonality (>= 400) and same-period-last-year at h <= 65."""
    return synthetic_series(days=430)


@pytest.fixture(scope="session")
def series_120() -> list[SeriesPoint]:
    return synthetic_series(days=120)


@pytest.fixture(scope="session")
def series_40() -> list[SeriesPoint]:
    return synthetic_series(days=40)


@pytest.fixture
def day() -> type[date]:
    return date
