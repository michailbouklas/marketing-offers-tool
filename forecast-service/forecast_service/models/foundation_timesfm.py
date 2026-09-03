"""``foundation`` — Google TimesFM 2.5 (200M parameters), zero-shot, CPU.

A pretrained decoder-only time-series model: no fitting, the history array goes in and
point + quantile forecasts come out. It knows nothing about holidays, paydays or offers —
it complements ``calendar_boost`` rather than replacing it.

Registered only when ``FORECAST_FOUNDATION_ENABLED=1`` **and** the ``foundation`` extra is
installed (``uv sync --extra foundation``). Runs in the dedicated heavy worker
(``ModelInfo.heavy``) because the weights take ~1.3 GB of RAM per process.

Checkpoint: ``google/timesfm-2.5-200m-pytorch`` (Apache-2.0, 925 MB). Do **not** switch to a
TimesFM 3.0 checkpoint — those weights are licensed for non-commercial, non-production use only.
"""

from __future__ import annotations

import importlib.util
import logging
from typing import Any

import numpy as np

from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
from forecast_service.models.registry import register
from forecast_service.preprocess import CleanSeries
from forecast_service.settings import get_settings

log = logging.getLogger("forecast_service.foundation")

CHECKPOINT = "google/timesfm-2.5-200m-pytorch"
MODEL_VERSION = "2.5.0"
MIN_HISTORY_DAYS = 90
# >= the API's 90-day horizon cap; TimesFM decodes 128 steps per pass, so one pass covers it.
MAX_HORIZON = 128
# In-sample line: rolling two-week-ahead replay in one batched forward pass. Each window costs
# ~0.1 s on 4 CPU threads, so cover the 365 returned history days with as few as possible.
FITTED_STEP = 14
MAX_FITTED_WINDOWS = 27  # ceil(365 / 14)
# Series per padded batch. Every call is padded to this size, so a single-series forecast with
# the library default (32) costs as much as 32 series; 8 keeps the replay batches efficient.
BATCH_SIZE = 8
# The quantile head returns q10..q90, i.e. an 80 % band. Wider bands are extrapolated per side.
Z_SCORES = {80: 1.2816, 90: 1.6449, 95: 1.9600}
NATIVE_LEVEL = 80
Q_LO80, Q_HI80 = 1, 9  # quantile axis layout: [mean, q10, q20, ..., q90]

_STATE: dict[str, Any] = {}


def is_available() -> bool:
    """Enabled by settings and the ``timesfm`` package is importable."""
    return bool(get_settings().foundation_enabled) and (
        importlib.util.find_spec("timesfm") is not None
    )


def _load() -> Any:
    """Load and compile the model once per process (lazy; warm-up triggers it)."""
    model = _STATE.get("model")
    if model is not None:
        return model
    import timesfm
    import torch

    settings = get_settings()
    torch.set_num_threads(settings.foundation_threads)
    torch.set_float32_matmul_precision("high")
    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(CHECKPOINT)
    model.compile(
        timesfm.ForecastConfig(
            max_context=settings.foundation_max_context,
            max_horizon=MAX_HORIZON,
            normalize_inputs=True,
            per_core_batch_size=BATCH_SIZE,
            use_continuous_quantile_head=True,
            # Averaging f(x) with -f(-x) doubles the compute for no gain on positive sales.
            force_flip_invariance=False,
            infer_is_positive=True,
            fix_quantile_crossing=True,
        )
    )
    _STATE["model"] = model
    log.info("TimesFM loaded (%s, max_context=%d)", CHECKPOINT, settings.foundation_max_context)
    return model


def _rolling_fitted(model: Any, y: np.ndarray) -> np.ndarray:
    """Rolling replay over the tail of the series: ``fitted[c:c+FITTED_STEP]`` is the forecast
    made from ``y[:c]``. NaN before the first cutoff. One batched ``forecast`` call."""
    n = len(y)
    fitted = np.full(n, np.nan)
    windows = min(MAX_FITTED_WINDOWS, (n - MIN_HISTORY_DAYS) // FITTED_STEP)
    if windows < 1:
        return fitted
    cutoffs = [n - FITTED_STEP * k for k in range(windows, 0, -1)]
    point, _ = model.forecast(horizon=FITTED_STEP, inputs=[y[:c] for c in cutoffs])
    for i, c in enumerate(cutoffs):
        fitted[c : c + FITTED_STEP] = point[i]
    return np.clip(np.nan_to_num(fitted, nan=np.nan), 0.0, None)


class FoundationModel:
    info = ModelInfo(
        id="foundation",
        name="Foundation (TimesFM)",
        description=(
            "Google's pretrained TimesFM model reads the recent history and forecasts without "
            "fitting. A different lens from the other models; no holiday or offer awareness."
        ),
        version=MODEL_VERSION,
        min_history_days=MIN_HISTORY_DAYS,
        recommended_horizons=[7, 14, 30],
        supports_holidays=False,
        sort_order=50,
        heavy=True,
    )

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput:
        model = _load()
        y = series.y_interp.astype(np.float32)

        point, quantiles = model.forecast(horizon=horizon, inputs=[y])
        yhat = np.clip(np.asarray(point[0], dtype=float), 0.0, None)
        lo80 = np.minimum(np.asarray(quantiles[0, :, Q_LO80], dtype=float), yhat)
        hi80 = np.maximum(np.asarray(quantiles[0, :, Q_HI80], dtype=float), yhat)

        bands: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for lv in sorted(level):
            ratio = Z_SCORES.get(lv, 1.96) / Z_SCORES[NATIVE_LEVEL]
            lo = yhat - (yhat - lo80) * ratio
            hi = yhat + (hi80 - yhat) * ratio
            bands[lv] = (np.clip(lo, 0.0, None), hi)

        fitted = _rolling_fitted(model, y) if ctx.fitted_required else None
        future = series.future_index(horizon)
        return ModelOutput(
            ds=[d.date() for d in future],
            yhat=yhat,
            bands=bands,
            fitted=fitted,
            components=None,
            notes=[
                "Zero-shot pretrained model (TimesFM 2.5); the in-sample line is a rolling "
                "two-week-ahead replay, not a fit."
            ],
            holidays_used=False,
            yearly_seasonality_used=series.n_days >= 365,
        )


if is_available():
    register(FoundationModel())
elif get_settings().foundation_enabled:
    log.warning(
        "FORECAST_FOUNDATION_ENABLED is set but the 'timesfm' package is missing; "
        "install the extra (`uv sync --extra foundation`). Model 'foundation' not registered."
    )
