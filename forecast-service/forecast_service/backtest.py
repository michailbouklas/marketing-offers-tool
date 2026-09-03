"""Rolling-origin holdout shared by every model so grades are comparable."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from forecast_service.models.base import ForecastModel, RunContext
from forecast_service.preprocess import MIN_HISTORY_DAYS, CleanSeries

MAX_HOLDOUT_DAYS = 28
GRADE_HIGH_WAPE = 12.0
GRADE_MEDIUM_WAPE = 25.0
GRADE_LABELS = {"high": "High confidence", "medium": "Moderate confidence", "low": "Low confidence"}
LEVELS = [80, 95]


@dataclass(frozen=True)
class BacktestResult:
    holdout_days: int
    folds: int
    wape_pct: float
    mape_pct: float | None
    mae: float
    bias_pct: float
    coverage80_pct: float | None
    grade: str
    grade_label: str


def holdout_length(horizon: int, n_days: int) -> int:
    return max(0, min(horizon, MAX_HOLDOUT_DAYS, n_days // 5))


def grade_for_wape(wape_pct: float) -> tuple[str, str]:
    if wape_pct <= GRADE_HIGH_WAPE:
        grade = "high"
    elif wape_pct <= GRADE_MEDIUM_WAPE:
        grade = "medium"
    else:
        grade = "low"
    return grade, GRADE_LABELS[grade]


def compute_metrics(
    y: np.ndarray,
    yhat: np.ndarray,
    lo80: np.ndarray | None,
    hi80: np.ndarray | None,
    *,
    holdout_days: int,
    folds: int,
) -> BacktestResult | None:
    """Pooled metrics over every holdout day. ``None`` when actuals sum to zero."""
    y = np.asarray(y, dtype=float)
    yhat = np.asarray(yhat, dtype=float)
    denom = float(np.sum(np.abs(y)))
    if len(y) == 0 or denom <= 0:
        return None
    err = yhat - y
    wape = float(np.sum(np.abs(err)) / denom * 100.0)
    positive = y > 0
    mape = float(np.mean(np.abs(err[positive]) / y[positive]) * 100.0) if positive.any() else None
    mae = float(np.mean(np.abs(err)))
    bias = float(np.sum(err) / denom * 100.0)
    coverage = None
    if lo80 is not None and hi80 is not None:
        inside = (y >= np.asarray(lo80)) & (y <= np.asarray(hi80))
        coverage = float(np.mean(inside) * 100.0)
    grade, label = grade_for_wape(wape)
    return BacktestResult(
        holdout_days=holdout_days,
        folds=folds,
        wape_pct=round(wape, 2),
        mape_pct=None if mape is None else round(mape, 2),
        mae=round(mae, 2),
        bias_pct=round(bias, 2),
        coverage80_pct=None if coverage is None else round(coverage, 1),
        grade=grade,
        grade_label=label,
    )


def run_backtest(
    model: ForecastModel,
    series: CleanSeries,
    horizon: int,
    folds: int,
    ctx: RunContext,
) -> BacktestResult | None:
    """Fit ``folds`` times on progressively shorter history; ``None`` if nothing could be scored."""
    if folds <= 0:
        return None
    n = series.n_days
    holdout = holdout_length(horizon, n)
    if holdout <= 0:
        return None
    min_train = max(MIN_HISTORY_DAYS, model.info.min_history_days)

    ys: list[np.ndarray] = []
    yhats: list[np.ndarray] = []
    los: list[np.ndarray] = []
    his: list[np.ndarray] = []
    completed = 0
    for k in range(folds):
        end = n - holdout * k
        train_end = end - holdout
        if train_end < min_train:
            break
        train = series.head(train_end)
        ctx.fitted_required = False  # only yhat/bands are scored
        try:
            out = model.fit_predict(train, holdout, LEVELS, ctx)
        finally:
            ctx.fitted_required = True
        keep = ~series.closure_mask[train_end:end]
        if not keep.any():
            completed += 1
            continue
        ys.append(series.y[train_end:end][keep])
        yhats.append(np.asarray(out.yhat)[keep])
        lo, hi = out.bands[80]
        los.append(np.asarray(lo)[keep])
        his.append(np.asarray(hi)[keep])
        completed += 1

    if completed == 0 or not ys:
        return None
    return compute_metrics(
        np.concatenate(ys),
        np.concatenate(yhats),
        np.concatenate(los),
        np.concatenate(his),
        holdout_days=holdout,
        folds=completed,
    )
