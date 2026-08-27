"""Data hygiene: turn a sparse daily series into a complete, model-ready calendar.

Rules (each emits a warning code, see the plan):
1. sorted / unique dates and finite ``y``  -> otherwise ``INVALID_SERIES``
2. trim leading zero days before the first sale
3. reindex to a complete daily calendar; missing days are **zero** (``GAPS_FILLED``)
4. runs of >= 7 zero days are closures: NaN for Prophet, interpolated for
   statsforecast (``CLOSURE_PERIOD``)
5. negatives clipped to zero (``NEGATIVE_CLIPPED``)
6. ``|y - rolling_median_28| > 5 * MAD_28`` flagged only (``OUTLIERS_DETECTED``)
7. < 56 usable days -> ``INSUFFICIENT_HISTORY``; < 400 -> ``INSUFFICIENT_FOR_YEARLY``;
   ``horizon > n_days / 3`` -> ``HORIZON_LONG_FOR_HISTORY``
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace

import numpy as np
import pandas as pd

from forecast_service.errors import ForecastError
from forecast_service.schemas import ForecastWarning, SeriesPoint

MIN_HISTORY_DAYS = 56
YEARLY_MIN_DAYS = 400
CLOSURE_MIN_DAYS = 7
OUTLIER_WINDOW = 28
OUTLIER_MAD_MULTIPLIER = 5.0


@dataclass
class CleanSeries:
    """A complete daily calendar with three views of the same target."""

    ds: pd.DatetimeIndex
    y: np.ndarray
    """Zero-filled, negatives clipped; closure days stay 0. Used for actuals and metrics."""
    y_nan_closures: np.ndarray
    """Closure days are NaN (Prophet skips them)."""
    y_interp: np.ndarray
    """Closure days linearly interpolated (statsforecast needs a dense series)."""
    orders: np.ndarray | None
    """Daily order count as float with NaN where unknown; None when never supplied."""
    closure_mask: np.ndarray
    outlier_mask: np.ndarray
    horizon: int
    warnings: list[ForecastWarning] = field(default_factory=list)

    @property
    def n_days(self) -> int:
        return len(self.y)

    @property
    def yearly_ok(self) -> bool:
        return self.n_days >= YEARLY_MIN_DAYS

    @property
    def cutoff(self) -> pd.Timestamp:
        return self.ds[-1]

    def head(self, n_days: int) -> CleanSeries:
        """First ``n_days`` days (backtest training window). Warnings are not carried."""
        n_days = max(0, min(n_days, self.n_days))
        return replace(
            self,
            ds=self.ds[:n_days],
            y=self.y[:n_days],
            y_nan_closures=self.y_nan_closures[:n_days],
            y_interp=self.y_interp[:n_days],
            orders=None if self.orders is None else self.orders[:n_days],
            closure_mask=self.closure_mask[:n_days],
            outlier_mask=self.outlier_mask[:n_days],
            warnings=[],
        )

    def future_index(self, horizon: int | None = None) -> pd.DatetimeIndex:
        h = self.horizon if horizon is None else horizon
        return pd.date_range(self.cutoff + pd.Timedelta(days=1), periods=h, freq="D")


def _warning(code: str, message: str, **details: object) -> ForecastWarning:
    return ForecastWarning(code=code, message=message, details=details or None)


def _zero_runs(is_zero: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    """Return ``(start, end_exclusive)`` for each run of True at least ``min_len`` long."""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, flag in enumerate(is_zero):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start >= min_len:
                runs.append((start, i))
            start = None
    if start is not None and len(is_zero) - start >= min_len:
        runs.append((start, len(is_zero)))
    return runs


def _flag_outliers(y: np.ndarray, closure_mask: np.ndarray) -> np.ndarray:
    s = pd.Series(np.where(closure_mask, np.nan, y))
    min_periods = OUTLIER_WINDOW // 2
    median = s.rolling(OUTLIER_WINDOW, center=True, min_periods=min_periods).median()
    deviation = (s - median).abs()
    mad = deviation.rolling(OUTLIER_WINDOW, center=True, min_periods=min_periods).median()
    flagged = (deviation > OUTLIER_MAD_MULTIPLIER * mad) & (mad > 0)
    return flagged.fillna(False).to_numpy(dtype=bool) & ~closure_mask


def preprocess(points: Sequence[SeriesPoint], horizon: int) -> CleanSeries:
    if len(points) == 0:
        raise ForecastError("INVALID_SERIES", "The series is empty.")

    ds = pd.DatetimeIndex([pd.Timestamp(p.ds) for p in points])
    y = np.asarray([p.y for p in points], dtype=float)
    if not np.all(np.isfinite(y)):
        raise ForecastError("INVALID_SERIES", "Every `y` value must be a finite number.")
    if ds.has_duplicates:
        dupes = ds[ds.duplicated()].strftime("%Y-%m-%d").tolist()[:10]
        raise ForecastError(
            "INVALID_SERIES", "Dates must be unique.", {"duplicateDates": dupes}
        )
    if not ds.is_monotonic_increasing:
        raise ForecastError("INVALID_SERIES", "Dates must be sorted ascending.")

    has_orders = any(p.orders is not None for p in points)
    orders_raw = np.asarray(
        [np.nan if p.orders is None else float(p.orders) for p in points], dtype=float
    )

    warnings: list[ForecastWarning] = []

    # 2. trim leading days before the first sale
    positive = np.flatnonzero(y > 0)
    if len(positive) == 0:
        raise ForecastError("INVALID_SERIES", "The series contains no positive sales.")
    first = int(positive[0])
    ds, y, orders_raw = ds[first:], y[first:], orders_raw[first:]

    # 3. complete daily calendar, missing = 0
    full = pd.date_range(ds[0], ds[-1], freq="D")
    y_series = pd.Series(y, index=ds).reindex(full)
    missing = int(y_series.isna().sum())
    y = y_series.fillna(0.0).to_numpy(dtype=float)
    orders = pd.Series(orders_raw, index=ds).reindex(full).to_numpy(dtype=float)
    if missing > 0:
        warnings.append(
            _warning(
                "GAPS_FILLED",
                f"{missing} day(s) had no sales rows and were treated as zero sales.",
                filledDays=missing,
                trimmedLeadingDays=first,
            )
        )

    # 5. negatives (before closure detection so refunds-only days count as zero days)
    negatives = int(np.sum(y < 0))
    if negatives:
        y = np.clip(y, 0.0, None)
        warnings.append(
            _warning(
                "NEGATIVE_CLIPPED",
                f"{negatives} day(s) had negative net sales and were clipped to zero.",
                count=negatives,
            )
        )

    # 4. closures
    n = len(y)
    closure_mask = np.zeros(n, dtype=bool)
    runs = _zero_runs(y <= 0, CLOSURE_MIN_DAYS)
    for start, end in runs:
        closure_mask[start:end] = True
    y_nan = y.copy()
    y_interp = y.copy()
    if runs:
        y_nan[closure_mask] = np.nan
        idx = np.arange(n)
        good = ~closure_mask
        y_interp[closure_mask] = np.interp(idx[closure_mask], idx[good], y[good])
        periods = [
            {
                "from": full[s].strftime("%Y-%m-%d"),
                "to": full[e - 1].strftime("%Y-%m-%d"),
                "days": int(e - s),
            }
            for s, e in runs
        ]
        total = int(closure_mask.sum())
        warnings.append(
            _warning(
                "CLOSURE_PERIOD",
                f"{len(runs)} closure period(s) totalling {total} days were excluded from the "
                "pattern learning.",
                periods=periods,
            )
        )

    # 6. outliers (flag only)
    outlier_mask = _flag_outliers(y, closure_mask)
    n_outliers = int(outlier_mask.sum())
    if n_outliers:
        dates = full[outlier_mask].strftime("%Y-%m-%d").tolist()
        warnings.append(
            _warning(
                "OUTLIERS_DETECTED",
                f"{n_outliers} unusually high or low day(s) were detected; they were kept but "
                "may widen the forecast range.",
                count=n_outliers,
                dates=dates[:10],
            )
        )

    # 7. history checks
    if n < MIN_HISTORY_DAYS:
        raise ForecastError(
            "INSUFFICIENT_HISTORY",
            f"At least {MIN_HISTORY_DAYS} days of sales history are needed; {n} were usable.",
            {"days": n, "required": MIN_HISTORY_DAYS},
        )
    if n < YEARLY_MIN_DAYS:
        warnings.append(
            _warning(
                "INSUFFICIENT_FOR_YEARLY",
                f"Only {n} days of history: year-round seasonal patterns were not modelled "
                f"(needs {YEARLY_MIN_DAYS}).",
                days=n,
                required=YEARLY_MIN_DAYS,
            )
        )
    if horizon > n / 3:
        warnings.append(
            _warning(
                "HORIZON_LONG_FOR_HISTORY",
                f"A {horizon}-day forecast from {n} days of history is a long reach; "
                "expect a wider range.",
                horizonDays=horizon,
                days=n,
            )
        )

    return CleanSeries(
        ds=full,
        y=y,
        y_nan_closures=y_nan,
        y_interp=y_interp,
        orders=orders if has_orders else None,
        closure_mask=closure_mask,
        outlier_mask=outlier_mask,
        horizon=horizon,
        warnings=warnings,
    )
