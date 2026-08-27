"""``seasonal_trend`` — Prophet with weekly + yearly seasonality and public holidays."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from forecast_service.holidays_util import prophet_holidays_df
from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import CleanSeries

CHANGEPOINT_PRIOR_SCALE = 0.05


class SeasonalTrendModel:
    info = ModelInfo(
        id="seasonal_trend",
        name="Seasonal Trend",
        description=(
            "Learns the weekly rhythm, year-round seasonality and public-holiday effects on "
            "top of a flexible trend."
        ),
        version="1.0.0",
        min_history_days=60,
        recommended_horizons=[7, 14, 30, 90],
        supports_holidays=True,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        # prophet.plot logs an ERROR about plotly at import; we never plot.
        logging.getLogger("prophet.plot").setLevel(logging.CRITICAL)
        from prophet import Prophet

        # cmdstanpy configures its own INFO stream handler lazily at fit time when the logger
        # has no handlers; a NullHandler prevents that while WARNING+ still propagates to root.
        stan_logger = logging.getLogger("cmdstanpy")
        if not stan_logger.handlers:
            stan_logger.addHandler(logging.NullHandler())
        stan_logger.setLevel(logging.WARNING)
        # Prophet warns about yearly seasonality below 730 days; 400 is our documented threshold.
        logging.getLogger("prophet").setLevel(logging.ERROR)

        frame = pd.DataFrame({"ds": series.ds, "y": series.y_nan_closures})
        last_year = (series.cutoff + pd.Timedelta(days=horizon)).year
        years = range(series.ds[0].year, last_year + 1)
        holidays = prophet_holidays_df(ctx.country, years)
        if ctx.country and holidays is None:
            ctx.warn(
                "HOLIDAYS_UNAVAILABLE",
                f"Public holidays for '{ctx.country}' are not available; the forecast ignores "
                "holidays.",
                country=ctx.country,
            )
        yearly = series.yearly_ok

        model = Prophet(
            holidays=holidays,
            weekly_seasonality=True,
            yearly_seasonality=yearly,
            daily_seasonality=False,
            seasonality_mode="multiplicative",
            changepoint_prior_scale=CHANGEPOINT_PRIOR_SCALE,
            uncertainty_samples=ctx.uncertainty_samples,
        )
        model.fit(frame)

        future = model.make_future_dataframe(periods=horizon, include_history=True)
        prediction = model.predict(future)
        np.random.seed(ctx.seed)
        samples = model.predictive_samples(future)["yhat"]

        n_hist = len(frame)
        rows = slice(n_hist, n_hist + horizon)
        yhat = np.clip(prediction["yhat"].to_numpy()[rows], 0.0, None)
        future_samples = samples[rows]
        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for lv in level:
            alpha = (100 - lv) / 2
            lo = np.percentile(future_samples, alpha, axis=1)
            hi = np.percentile(future_samples, 100 - alpha, axis=1)
            bands[lv] = (np.clip(lo, 0.0, None), np.clip(hi, 0.0, None))

        fitted = np.clip(prediction["yhat"].to_numpy()[:n_hist], 0.0, None)

        components: dict[str, np.ndarray] = {}
        if "weekly" in prediction:
            dow = prediction["ds"].dt.dayofweek
            weekly = prediction["weekly"] * 100.0  # multiplicative -> % vs trend
            components["weekday_uplift_pct"] = np.array(
                [float(weekly[dow == d].mean()) for d in range(7)]
            )
        if holidays is not None and "holidays" in prediction:
            components["holiday_effect_pct"] = prediction["holidays"].to_numpy()[rows] * 100.0

        return ModelOutput(
            ds=[d.date() for d in future["ds"].iloc[rows]],
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=components,
            notes=[],
            holidays_used=holidays is not None,
            yearly_seasonality_used=yearly,
        )


register(SeasonalTrendModel())
