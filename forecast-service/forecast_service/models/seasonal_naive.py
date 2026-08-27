"""Internal reference model: same-weekday average over the last four weeks.

Also the template for adding a model: implement ``fit_predict``, return a
``ModelOutput``, and end the file with ``register(...)``.
"""

from __future__ import annotations

import numpy as np

from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import CleanSeries

WEEKS = 4
Z_SCORES = {80: 1.2816, 90: 1.6449, 95: 1.9600}


class SeasonalNaiveModel:
    info = ModelInfo(
        id="seasonal_naive",
        name="Seasonal Naive",
        description="Average of the same weekday over the last four weeks. Reference model.",
        version="1.0.0",
        min_history_days=56,
        recommended_horizons=[7, 14],
        supports_holidays=False,
        internal=True,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        y = series.y_interp
        n = len(y)
        window = 7 * WEEKS

        fitted = np.full(n, np.nan)
        for t in range(window, n):
            fitted[t] = np.mean([y[t - 7 * k] for k in range(1, WEEKS + 1)])
        residuals = y[window:] - fitted[window:]
        sigma = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
        if not np.isfinite(sigma):
            sigma = 0.0

        future = series.future_index(horizon)
        recent = y[-window:]
        recent_dow = series.ds[-window:].dayofweek.to_numpy()
        yhat = np.array([recent[recent_dow == d.dayofweek].mean() for d in future], dtype=float)
        yhat = np.clip(yhat, 0.0, None)

        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for lv in level:
            z = Z_SCORES.get(lv, 1.96)
            spread = z * sigma
            bands[lv] = (np.clip(yhat - spread, 0.0, None), yhat + spread)

        return ModelOutput(
            ds=[d.date() for d in future],
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=None,
            notes=[],
        )


register(SeasonalNaiveModel())
