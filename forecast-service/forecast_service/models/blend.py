"""``blend`` — equal-weight ensemble of the public models.

Averages the point forecasts and the interval bounds (quantile averaging) of every member that
can run on the series. A member that cannot (too little history, or it raised) is skipped with a
``FALLBACK_MODEL_USED`` warning; fewer than two survivors is a ``MODEL_FAILED``.
"""

from __future__ import annotations

import numpy as np

from forecast_service.errors import ForecastError
from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import CleanSeries

MEMBERS: tuple[str, ...] = ("seasonal_trend", "statistical_baseline", "calendar_boost")
MIN_MEMBERS = 2


def _nanmean_rows(rows: list[np.ndarray]) -> np.ndarray | None:
    """Element-wise mean ignoring NaN; NaN where every row is NaN. ``None`` for no rows."""
    if not rows:
        return None
    stack = np.vstack([np.asarray(r, dtype=float) for r in rows])
    finite = np.isfinite(stack)
    count = finite.sum(axis=0)
    total = np.where(finite, stack, 0.0).sum(axis=0)
    return np.where(count > 0, total / np.maximum(count, 1), np.nan)


class BlendModel:
    info = ModelInfo(
        id="blend",
        name="Blend",
        description=(
            "Averages the other models so no single method's blind spot drives the number. "
            "Usually the most reliable pick."
        ),
        version="1.0.0",
        min_history_days=120,
        recommended_horizons=[7, 14, 30, 90],
        supports_holidays=True,
        sort_order=40,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        from forecast_service.models.registry import get_model

        outputs: list[ModelOutput] = []
        used: list[str] = []
        skipped: list[dict[str, str]] = []
        for member_id in MEMBERS:
            member = get_model(member_id)
            if series.n_days < member.info.min_history_days:
                skipped.append(
                    {
                        "modelId": member_id,
                        "reason": f"needs {member.info.min_history_days} days of history",
                    }
                )
                continue
            try:
                outputs.append(member.fit_predict(series, horizon, level, ctx))
            except Exception as exc:  # one failing member must not sink the blend
                skipped.append(
                    {"modelId": member_id, "reason": f"{type(exc).__name__}: {exc}"[:200]}
                )
                continue
            used.append(member.info.name)

        if len(outputs) < MIN_MEMBERS:
            raise ForecastError(
                "MODEL_FAILED",
                f"Blend needs at least {MIN_MEMBERS} models to agree on; {len(outputs)} ran.",
                {"modelId": self.info.id, "skipped": skipped},
            )
        if skipped:
            names = ", ".join(s["modelId"] for s in skipped)
            ctx.warn(
                "FALLBACK_MODEL_USED",
                f"Blend ran without {names}; the remaining {len(outputs)} models were averaged.",
                skipped=skipped,
            )

        yhat = np.mean([np.asarray(o.yhat, dtype=float) for o in outputs], axis=0)
        yhat = np.clip(yhat, 0.0, None)
        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for lv in level:
            lo = np.mean([np.asarray(o.bands[lv][0], dtype=float) for o in outputs], axis=0)
            hi = np.mean([np.asarray(o.bands[lv][1], dtype=float) for o in outputs], axis=0)
            bands[lv] = (np.clip(lo, 0.0, None), np.clip(hi, 0.0, None))
        fitted = _nanmean_rows([o.fitted for o in outputs if o.fitted is not None])
        if fitted is not None:
            fitted = np.where(np.isfinite(fitted), np.clip(fitted, 0.0, None), np.nan)

        return ModelOutput(
            ds=list(outputs[0].ds),
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=None,
            notes=[f"Blend of {len(used)} models: {', '.join(used)}."],
            holidays_used=any(o.holidays_used for o in outputs),
            yearly_seasonality_used=any(o.yearly_seasonality_used for o in outputs),
        )


register(BlendModel())
