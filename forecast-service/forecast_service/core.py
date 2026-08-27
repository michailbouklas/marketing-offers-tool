"""``run_forecast``: preprocess -> backtest -> final fit -> summarize. Pure and picklable."""

from __future__ import annotations

import time
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

import numpy as np

from forecast_service import ENGINE_VERSION
from forecast_service.backtest import LEVELS, run_backtest
from forecast_service.errors import ForecastError
from forecast_service.models.base import RunContext
from forecast_service.models.registry import get_model
from forecast_service.preprocess import preprocess
from forecast_service.schemas import (
    ForecastAccuracy,
    ForecastPoint,
    ForecastRequest,
    ForecastResult,
    ForecastWarning,
    HistoryPoint,
)
from forecast_service.settings import get_settings
from forecast_service.summarize import build_seasonality, build_summary, compute_trend

MIN_HISTORY_RETURNED = 365


def _r2(values: np.ndarray) -> np.ndarray:
    return np.round(np.nan_to_num(np.asarray(values, dtype=float), nan=0.0), 2)


def _dedupe(warnings: list[ForecastWarning]) -> list[ForecastWarning]:
    seen: set[str] = set()
    out: list[ForecastWarning] = []
    for w in warnings:
        if w.code not in seen:
            seen.add(w.code)
            out.append(w)
    return out


def run_forecast(req: ForecastRequest) -> ForecastResult:
    started = time.perf_counter()
    settings = get_settings()
    horizon = req.horizon_days

    model = get_model(req.model_id)
    info = model.info
    series = preprocess(req.series, horizon)
    if series.n_days < info.min_history_days:
        raise ForecastError(
            "INSUFFICIENT_HISTORY",
            f"{info.name} needs at least {info.min_history_days} days of sales history; "
            f"{series.n_days} were usable.",
            {"days": series.n_days, "required": info.min_history_days, "modelId": info.id},
        )

    country = (req.country or settings.default_country or "").strip().upper() or None
    ctx = RunContext(country=country, uncertainty_samples=settings.uncertainty_samples)
    warnings: list[ForecastWarning] = list(series.warnings)

    accuracy: ForecastAccuracy | None = None
    if req.backtest_folds > 0:
        try:
            result = run_backtest(model, series, horizon, req.backtest_folds, ctx)
        except ForecastError:
            raise
        except Exception as exc:
            result = None
            ctx.warn(
                "BACKTEST_SKIPPED",
                "Accuracy could not be measured because the test fit failed.",
                error=f"{type(exc).__name__}: {exc}"[:300],
            )
        if result is None:
            ctx.warn(
                "BACKTEST_SKIPPED",
                "Not enough history to hold back a test period, so accuracy could not be measured.",
            )
        else:
            accuracy = ForecastAccuracy(**asdict(result))

    try:
        output = model.fit_predict(series, horizon, LEVELS, ctx)
    except ForecastError:
        raise
    except Exception as exc:
        raise ForecastError(
            "MODEL_FAILED",
            f"{info.name} could not produce a forecast ({type(exc).__name__}).",
            {"modelId": info.id, "error": str(exc)[:300]},
        ) from exc

    yhat = np.clip(np.nan_to_num(np.asarray(output.yhat, dtype=float), nan=0.0), 0.0, None)
    if len(yhat) != horizon or len(output.ds) != horizon:
        raise ForecastError(
            "MODEL_FAILED",
            f"{info.name} returned {len(yhat)} points for a {horizon}-day horizon.",
            {"modelId": info.id},
        )
    lo80, hi80 = (np.nan_to_num(np.asarray(b, dtype=float)) for b in output.bands[80])
    lo95, hi95 = (np.nan_to_num(np.asarray(b, dtype=float)) for b in output.bands[95])
    lo80 = np.clip(np.minimum(lo80, yhat), 0.0, None)
    hi80 = np.maximum(hi80, yhat)
    lo95 = np.clip(np.minimum(lo95, lo80), 0.0, None)
    hi95 = np.maximum(hi95, hi80)

    summary = build_summary(series, output.ds, yhat, lo80, hi80)
    trend_direction, trend_pct = compute_trend(series, output.fitted, yhat)
    seasonality = build_seasonality(series, output, ctx.country)

    keep = max(MIN_HISTORY_RETURNED, 2 * horizon)
    fitted = None if output.fitted is None else np.asarray(output.fitted, dtype=float)
    history: list[HistoryPoint] = []
    for i in range(max(0, series.n_days - keep), series.n_days):
        f = None if fitted is None or not np.isfinite(fitted[i]) else round(float(fitted[i]), 2)
        history.append(
            HistoryPoint(ds=series.ds[i].date(), y=round(float(series.y[i]), 2), fitted=f)
        )

    forecast = [
        ForecastPoint(ds=d, yhat=a, lo80=b, hi80=c, lo95=e, hi95=g)
        for d, a, b, c, e, g in zip(
            output.ds, _r2(yhat), _r2(lo80), _r2(hi80), _r2(lo95), _r2(hi95), strict=True
        )
    ]

    warnings.extend(ctx.warnings)
    runtime_ms = int((time.perf_counter() - started) * 1000)
    return ForecastResult(
        model_id=info.id,
        model_name=info.name,
        model_version=info.version,
        engine_version=ENGINE_VERSION,
        horizon_days=horizon,
        cutoff_date=series.cutoff.date(),
        history=history,
        forecast=forecast,
        summary=summary,
        accuracy=accuracy,
        trend_direction=trend_direction,
        trend_pct_per30d=trend_pct,
        seasonality=seasonality,
        warnings=_dedupe(warnings),
        runtime_ms=runtime_ms,
        generated_at=datetime.now(UTC),
    )


def run_forecast_json(payload: dict[str, Any]) -> dict[str, Any]:
    """Process-pool entry point: plain dict in, camelCase JSON-ready dict out."""
    req = ForecastRequest.model_validate(payload)
    return run_forecast(req).model_dump(by_alias=True, mode="json")
