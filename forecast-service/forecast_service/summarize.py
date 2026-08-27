"""Turn arrays into the numbers and sentences a marketing user reads."""

from __future__ import annotations

import calendar
from datetime import date

import numpy as np
import pandas as pd

from forecast_service.holidays_util import upcoming_holidays
from forecast_service.models.base import ModelOutput
from forecast_service.preprocess import CleanSeries
from forecast_service.schemas import ForecastSeasonality, ForecastSummary, UpcomingHoliday

TREND_FLAT_PCT_PER_30D = 3.0
TREND_LOOKBACK_DAYS = 90
WEEKDAY_LOOKBACK_DAYS = 364
AOV_LOOKBACK_DAYS = 90
WEEKDAY_NAMES = list(calendar.day_name)  # Monday..Sunday


def _round(value: float, digits: int = 2) -> float:
    return float(round(float(value), digits))


def _pct_change(current: float, base: float) -> float | None:
    if base is None or base <= 0:
        return None
    return _round((current / base - 1.0) * 100.0, 1)


# ---------------------------------------------------------------- summary


def build_summary(
    series: CleanSeries,
    forecast_ds: list[date],
    yhat: np.ndarray,
    lo80: np.ndarray,
    hi80: np.ndarray,
) -> ForecastSummary:
    horizon = len(yhat)
    total = float(np.sum(yhat))

    same_period_last_year: float | None = None
    if series.n_days >= 365 + horizon:
        shifted = pd.DatetimeIndex([pd.Timestamp(d) - pd.Timedelta(days=365) for d in forecast_ds])
        lookup = pd.Series(series.y, index=series.ds)
        if shifted.isin(series.ds).all():
            same_period_last_year = float(lookup.loc[shifted].sum())

    trailing = float(np.sum(series.y[-horizon:]))
    peak = int(np.argmax(yhat))
    low = int(np.argmin(yhat))

    average_order_value: float | None = None
    if series.orders is not None:
        tail = slice(-min(AOV_LOOKBACK_DAYS, series.n_days), None)
        orders = series.orders[tail]
        revenue = series.y[tail]
        valid = np.isfinite(orders) & (orders > 0) & ~series.closure_mask[tail]
        if valid.any() and orders[valid].sum() > 0:
            average_order_value = _round(revenue[valid].sum() / orders[valid].sum())

    return ForecastSummary(
        horizon_total=_round(total),
        horizon_lower80=_round(float(np.sum(lo80))),
        horizon_upper80=_round(float(np.sum(hi80))),
        same_period_last_year=(
            None if same_period_last_year is None else _round(same_period_last_year)
        ),
        vs_last_year_pct=(
            None if same_period_last_year is None else _pct_change(total, same_period_last_year)
        ),
        trailing_period_total=_round(trailing),
        vs_trailing_pct=_pct_change(total, trailing),
        average_daily=_round(total / horizon),
        peak_day=forecast_ds[peak],
        peak_day_value=_round(float(yhat[peak])),
        low_day=forecast_ds[low],
        low_day_value=_round(float(yhat[low])),
        average_order_value=average_order_value,
    )


# ---------------------------------------------------------------- trend


def compute_trend(
    series: CleanSeries, fitted: np.ndarray | None, yhat: np.ndarray
) -> tuple[str, float]:
    """Slope of (last 90 fitted days + horizon) as % of level per 30 days; ±3 % is flat."""
    lookback = min(TREND_LOOKBACK_DAYS, series.n_days)
    base = None
    if fitted is not None:
        candidate = np.asarray(fitted, dtype=float)[-lookback:]
        if np.isfinite(candidate).sum() >= max(7, lookback // 2):
            base = candidate
    if base is None:
        base = np.where(series.closure_mask[-lookback:], np.nan, series.y[-lookback:])
    values = np.concatenate([base, np.asarray(yhat, dtype=float)])
    x = np.arange(len(values), dtype=float)
    ok = np.isfinite(values)
    level = float(np.nanmean(values)) if ok.any() else 0.0
    if ok.sum() < 3 or level <= 0:
        return "flat", 0.0
    slope = float(np.polyfit(x[ok], values[ok], 1)[0])
    pct_per_30d = slope * 30.0 / level * 100.0
    if pct_per_30d > TREND_FLAT_PCT_PER_30D:
        direction = "up"
    elif pct_per_30d < -TREND_FLAT_PCT_PER_30D:
        direction = "down"
    else:
        direction = "flat"
    return direction, _round(pct_per_30d, 1)


# ---------------------------------------------------------------- seasonality


def weekday_uplift_from_history(series: CleanSeries) -> np.ndarray:
    """Per-weekday % vs the weekly average over the last year of open days (Mon..Sun)."""
    lookback = min(WEEKDAY_LOOKBACK_DAYS, series.n_days)
    y = series.y[-lookback:]
    ds = series.ds[-lookback:]
    keep = ~series.closure_mask[-lookback:]
    frame = pd.DataFrame({"y": y[keep], "dow": ds[keep].dayofweek})
    overall = frame["y"].mean() if len(frame) else 0.0
    uplift = np.zeros(7)
    if overall > 0:
        means = frame.groupby("dow")["y"].mean()
        for dow in range(7):
            if dow in means.index:
                uplift[dow] = (means.loc[dow] / overall - 1.0) * 100.0
    return uplift


def _weekday_sentence(name: str, pct: float) -> str:
    magnitude = round(abs(pct))
    if magnitude < 1:
        return f"{name}s are roughly in line with the weekly average."
    word = "busier" if pct > 0 else "quieter"
    return f"{name}s are typically {magnitude}% {word} than the weekly average."


def build_seasonality(
    series: CleanSeries,
    output: ModelOutput,
    country: str | None,
) -> ForecastSeasonality:
    components = output.components or {}
    uplift = components.get("weekday_uplift_pct")
    if uplift is None or len(uplift) != 7 or not np.all(np.isfinite(uplift)):
        uplift = weekday_uplift_from_history(series)
    uplift = np.asarray(uplift, dtype=float)
    strongest = int(np.argmax(uplift))
    weakest = int(np.argmin(uplift))

    notes: list[str] = [
        _weekday_sentence(WEEKDAY_NAMES[strongest], float(uplift[strongest])),
    ]
    if weakest != strongest:
        notes.append(_weekday_sentence(WEEKDAY_NAMES[weakest], float(uplift[weakest])))

    if output.yearly_seasonality_used:
        years = series.n_days / 365.25
        notes.append(
            "Year-round seasonal swings (summer, holidays) were learned from "
            f"{years:.1f} years of history."
        )
    elif not series.yearly_ok:
        notes.append(
            "Less than about 13 months of history, so year-round seasonal swings are not "
            "modelled yet."
        )

    future = series.future_index(len(output.yhat))
    holiday_effect = components.get("holiday_effect_pct")
    upcoming: list[UpcomingHoliday] = []
    future_dates = [d.date() for d in future]
    for d, name in upcoming_holidays(country, future):
        effect = None
        if holiday_effect is not None and d in future_dates:
            value = float(holiday_effect[future_dates.index(d)])
            effect = _round(value, 1) if np.isfinite(value) else None
        upcoming.append(UpcomingHoliday(ds=d, name=name, expected_effect_pct=effect))

    if upcoming:
        names = ", ".join(f"{h.name} ({h.ds.strftime('%d %b')})" for h in upcoming[:4])
        more = f" and {len(upcoming) - 4} more" if len(upcoming) > 4 else ""
        plural = "s" if len(upcoming) != 1 else ""
        notes.append(
            f"{len(upcoming)} public holiday{plural} fall{'' if plural else 's'} inside the "
            f"forecast window: {names}{more}."
        )
    elif output.holidays_used:
        notes.append("No public holidays fall inside the forecast window.")

    notes.extend(output.notes)

    return ForecastSeasonality(
        strongest_weekday=WEEKDAY_NAMES[strongest],
        weakest_weekday=WEEKDAY_NAMES[weakest],
        weekday_uplift_pct=_round(float(uplift[strongest]), 1),
        yearly_seasonality_used=output.yearly_seasonality_used,
        holidays_used=output.holidays_used,
        upcoming_holidays=upcoming,
        notes=notes,
    )
