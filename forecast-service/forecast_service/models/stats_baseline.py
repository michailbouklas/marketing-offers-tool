"""``statistical_baseline`` — statsforecast MSTL decomposition with an AutoETS trend."""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import CleanSeries

ALIAS = "MSTL"
YEARLY_MIN_DAYS = 730  # STL needs two full cycles of the longest season


class StatisticalBaselineModel:
    info = ModelInfo(
        id="statistical_baseline",
        name="Statistical Baseline",
        description=(
            "Splits sales into a weekly (and, with two years of data, yearly) pattern plus a "
            "smoothed trend and projects each forward. Fast, no holiday awareness."
        ),
        version="1.0.0",
        min_history_days=60,
        recommended_horizons=[7, 14, 30],
        supports_holidays=False,
        sort_order=20,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        os.environ.setdefault("NIXTLA_ID_AS_COL", "1")
        from statsforecast import StatsForecast
        from statsforecast.models import MSTL, AutoETS, SeasonalNaive

        season_length = [7, 365] if series.n_days >= YEARLY_MIN_DAYS else [7]
        frame = pd.DataFrame(
            {"unique_id": "series", "ds": series.ds, "y": series.y_interp.astype(float)}
        )
        model = MSTL(
            season_length=season_length,
            trend_forecaster=AutoETS(model="ZZN"),
            alias=ALIAS,
        )
        sf = StatsForecast(
            models=[model],
            freq="D",
            n_jobs=1,
            fallback_model=SeasonalNaive(season_length=7),
        )
        levels = sorted(level)
        forecast = sf.forecast(df=frame, h=horizon, level=levels, fitted=True)
        fitted_frame = sf.forecast_fitted_values()

        yhat = np.clip(forecast[ALIAS].to_numpy(dtype=float), 0.0, None)
        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for lv in levels:
            lo = forecast[f"{ALIAS}-lo-{lv}"].to_numpy(dtype=float)
            hi = forecast[f"{ALIAS}-hi-{lv}"].to_numpy(dtype=float)
            bands[lv] = (np.clip(lo, 0.0, None), np.clip(hi, 0.0, None))

        fitted_by_ds = pd.Series(
            fitted_frame[ALIAS].to_numpy(dtype=float), index=pd.DatetimeIndex(fitted_frame["ds"])
        ).reindex(series.ds)
        fitted = np.clip(fitted_by_ds.to_numpy(dtype=float), 0.0, None)

        return ModelOutput(
            ds=[pd.Timestamp(d).date() for d in forecast["ds"]],
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=None,
            notes=[],
            holidays_used=False,
            yearly_seasonality_used=365 in season_length,
        )


register(StatisticalBaselineModel())
