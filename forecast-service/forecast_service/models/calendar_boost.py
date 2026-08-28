"""``calendar_boost`` — gradient-boosted trees on calendar, public-holiday and lag features.

The retail/QSR workhorse: a ``HistGradientBoostingRegressor`` learns how the day of week, the day
of month (paydays), the position relative to public holidays (eve, day after, bridge days) and the
recent weeks (lags, rolling means) shape sales. ``mlforecast`` supplies the recursive lags and
conformal prediction intervals.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import numpy as np
import pandas as pd

from forecast_service.holidays_util import holidays_for
from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import MIN_HISTORY_DAYS, CleanSeries

ALIAS = "gbm"
BASE_LAGS = (7, 14, 21, 28)
YEARLY_LAG = 364  # 52 weeks keeps the weekday aligned with "same day last year"
YEARLY_MIN_DAYS = 730  # same threshold as statistical_baseline
ROLLING_WINDOWS = (7, 28)
SEASONAL_ROLLING_WEEKS = 4
HOLIDAY_WINDOW_DAYS = 7
PAYDAY_FROM_DOM = 25
PAYDAY_TO_DOM = 3
MAX_CONFORMAL_WINDOWS = 3
Z_SCORES = {80: 1.2816, 90: 1.6449, 95: 1.9600}

DateFeature = Callable[[object], np.ndarray]


def _named(name: str, fn: DateFeature) -> DateFeature:
    """mlforecast names the feature column after ``fn.__name__``."""
    fn.__name__ = name
    return fn


def _index(dates: object) -> pd.DatetimeIndex:
    return pd.DatetimeIndex(dates)


def calendar_features() -> list[DateFeature]:
    two_pi = 2.0 * np.pi
    return [
        _named("dow", lambda ds: _index(ds).dayofweek.to_numpy()),
        _named("dom", lambda ds: _index(ds).day.to_numpy()),
        _named("month", lambda ds: _index(ds).month.to_numpy()),
        _named(
            "doy_sin",
            lambda ds: np.sin(two_pi * _index(ds).dayofyear.to_numpy() / 365.25),
        ),
        _named(
            "doy_cos",
            lambda ds: np.cos(two_pi * _index(ds).dayofyear.to_numpy() / 365.25),
        ),
        _named(
            "payday_window",
            lambda ds: (
                (_index(ds).day >= PAYDAY_FROM_DOM) | (_index(ds).day <= PAYDAY_TO_DOM)
            ).astype(int),
        ),
    ]


def holiday_features(table: dict[date, str]) -> list[DateFeature]:
    """Distance-to-holiday features; ``table`` comes from :func:`holidays_for`."""
    holidays = np.array(sorted(np.datetime64(d, "D") for d in table), dtype="datetime64[D]")
    window = np.timedelta64(HOLIDAY_WINDOW_DAYS, "D")

    def to_days(ds: object) -> np.ndarray:
        return _index(ds).to_numpy().astype("datetime64[D]")

    def days_to(ds: object) -> np.ndarray:
        d = to_days(ds)
        if len(holidays) == 0:
            return np.full(len(d), HOLIDAY_WINDOW_DAYS)
        idx = np.searchsorted(holidays, d, side="left")
        has_next = idx < len(holidays)
        nxt = np.where(has_next, holidays[np.minimum(idx, len(holidays) - 1)], d + window)
        return np.minimum((nxt - d).astype(int), HOLIDAY_WINDOW_DAYS)

    def days_since(ds: object) -> np.ndarray:
        d = to_days(ds)
        if len(holidays) == 0:
            return np.full(len(d), HOLIDAY_WINDOW_DAYS)
        idx = np.searchsorted(holidays, d, side="right") - 1
        has_prev = idx >= 0
        prev = np.where(has_prev, holidays[np.maximum(idx, 0)], d - window)
        return np.minimum((d - prev).astype(int), HOLIDAY_WINDOW_DAYS)

    def is_bridge(ds: object) -> np.ndarray:
        dow = _index(ds).dayofweek.to_numpy()
        # Monday before a Tuesday holiday, Friday after a Thursday holiday.
        before = (dow == 0) & (days_to(ds) == 1)
        after = (dow == 4) & (days_since(ds) == 1)
        return (before | after).astype(int)

    return [
        _named("is_holiday", lambda ds: (days_to(ds) == 0).astype(int)),
        _named("days_to_holiday", days_to),
        _named("days_since_holiday", days_since),
        _named("is_holiday_eve", lambda ds: (days_to(ds) == 1).astype(int)),
        _named("is_bridge_day", is_bridge),
    ]


class CalendarBoostModel:
    info = ModelInfo(
        id="calendar_boost",
        name="Calendar Boost",
        description=(
            "Learns how paydays, holiday eves and bridge days, Easter week and the recent weeks "
            "shape sales. Best for the next 7-30 days."
        ),
        version="1.0.0",
        min_history_days=120,
        recommended_horizons=[7, 14, 30],
        supports_holidays=True,
        sort_order=30,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        from mlforecast import MLForecast
        from mlforecast.lag_transforms import RollingMean, SeasonalRollingMean
        from mlforecast.utils import PredictionIntervals
        from sklearn.ensemble import HistGradientBoostingRegressor

        lags = list(BASE_LAGS)
        yearly = series.n_days >= YEARLY_MIN_DAYS
        if yearly:
            lags.append(YEARLY_LAG)

        features = calendar_features()
        last_year = (series.cutoff + pd.Timedelta(days=horizon)).year
        table = holidays_for(ctx.country, range(series.ds[0].year, last_year + 1))
        if ctx.country and table is None:
            ctx.warn(
                "HOLIDAYS_UNAVAILABLE",
                f"Public holidays for '{ctx.country}' are not available; the forecast ignores "
                "holidays.",
                country=ctx.country,
            )
        if table:
            features.extend(holiday_features(table))

        frame = pd.DataFrame(
            {"unique_id": "series", "ds": series.ds, "y": series.y_interp.astype(float)}
        )
        gbm = HistGradientBoostingRegressor(
            max_iter=300,
            learning_rate=0.05,
            max_leaf_nodes=15,
            min_samples_leaf=10,
            l2_regularization=1.0,
            random_state=ctx.seed,
        )
        fcst = MLForecast(
            models={ALIAS: gbm},
            freq="D",
            lags=lags,
            lag_transforms={
                7: [
                    *(RollingMean(window_size=w) for w in ROLLING_WINDOWS),
                    SeasonalRollingMean(season_length=7, window_size=SEASONAL_ROLLING_WEEKS),
                ]
            },
            date_features=features,
            num_threads=1,
        )
        levels = sorted(level)

        # Rows lost to lags / rolling windows before the first complete feature vector.
        warm_rows = max(*lags, 7 + max(ROLLING_WINDOWS) - 1, 7 * SEASONAL_ROLLING_WEEKS)
        usable = series.n_days - warm_rows
        n_windows = min(MAX_CONFORMAL_WINDOWS, (usable - MIN_HISTORY_DAYS) // max(horizon, 1))
        intervals = PredictionIntervals(n_windows=n_windows, h=horizon) if n_windows >= 1 else None

        fcst.fit(frame, fitted=True, prediction_intervals=intervals)
        forecast = fcst.predict(horizon, level=levels if intervals else None)
        fitted_frame = fcst.forecast_fitted_values()

        yhat = np.clip(forecast[ALIAS].to_numpy(dtype=float), 0.0, None)
        fitted_by_ds = pd.Series(
            fitted_frame[ALIAS].to_numpy(dtype=float), index=pd.DatetimeIndex(fitted_frame["ds"])
        ).reindex(series.ds)
        fitted_raw = fitted_by_ds.to_numpy(dtype=float)
        fitted = np.where(np.isfinite(fitted_raw), np.clip(fitted_raw, 0.0, None), np.nan)

        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        if intervals:
            for lv in levels:
                lo = forecast[f"{ALIAS}-lo-{lv}"].to_numpy(dtype=float)
                hi = forecast[f"{ALIAS}-hi-{lv}"].to_numpy(dtype=float)
                bands[lv] = (np.clip(lo, 0.0, None), np.clip(hi, 0.0, None))
        else:
            # Too little history for conformal windows: Gaussian bands from in-sample residuals.
            ok = np.isfinite(fitted_raw)
            residuals = series.y_interp[ok] - fitted_raw[ok]
            sigma = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
            sigma = sigma if np.isfinite(sigma) else 0.0
            for lv in levels:
                spread = Z_SCORES.get(lv, 1.96) * sigma
                bands[lv] = (np.clip(yhat - spread, 0.0, None), yhat + spread)

        return ModelOutput(
            ds=[pd.Timestamp(d).date() for d in forecast["ds"]],
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=None,
            notes=[],
            holidays_used=bool(table),
            yearly_seasonality_used=yearly,
        )


register(CalendarBoostModel())
