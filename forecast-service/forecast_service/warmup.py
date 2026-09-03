"""Run every public model once on a synthetic series.

Used as the ``ProcessPoolExecutor`` initializer (loads Prophet's Stan binary and
compiles statsforecast's numba kernels per worker) and at image build time so the
numba cache is baked into the layer.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from forecast_service.schemas import ForecastRequest, SeriesPoint
from forecast_service.settings import apply_thread_env_defaults

_WARM = False
WARMUP_HORIZON = 7


def synthetic_series(
    days: int = 730,
    *,
    start: date = date(2023, 1, 2),
    base: float = 10_000.0,
    saturday_uplift: float = 0.30,
    trend_per_day: float = 2.0,
    yearly_amplitude: float = 0.10,
    noise_sd: float = 300.0,
    with_orders: bool = True,
    seed: int = 7,
) -> list[SeriesPoint]:
    """Weekly + yearly pattern with a Saturday peak; deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    points: list[SeriesPoint] = []
    for i in range(days):
        d = start + timedelta(days=i)
        weekday = 1.0 + (saturday_uplift if d.weekday() == 5 else 0.0)
        weekday -= 0.10 if d.weekday() == 1 else 0.0
        yearly = 1.0 + yearly_amplitude * np.sin(2 * np.pi * (i % 365) / 365)
        y = (base + trend_per_day * i) * weekday * yearly + rng.normal(0, noise_sd)
        y = max(0.0, float(y))
        orders = round(y / 12.5) if with_orders else None
        points.append(SeriesPoint(ds=d, y=round(y, 2), orders=orders))
    return points


def warmup(model_ids: list[str] | None = None, *, heavy: bool | None = None) -> list[str]:
    """Fit each public model on a short synthetic series. Returns the warmed model ids.

    ``heavy`` filters the default selection: ``False`` for the pool workers (skip the large
    in-memory models), ``True`` for the dedicated heavy worker, ``None`` for everything (CLI
    ``--warmup`` at image build).
    """
    global _WARM  # noqa: PLW0603
    apply_thread_env_defaults()
    from forecast_service.core import run_forecast
    from forecast_service.models.registry import list_models

    ids = model_ids or [
        m.id for m in list_models() if heavy is None or m.heavy == heavy
    ]
    series = synthetic_series(days=430)
    for model_id in ids:
        run_forecast(
            ForecastRequest(
                model_id=model_id,
                horizon_days=WARMUP_HORIZON,
                backtest_folds=0,
                series=series,
            )
        )
    _WARM = True
    return ids


def is_warm() -> bool:
    return _WARM
