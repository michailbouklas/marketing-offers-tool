"""Model plugin contract. A model is one file that ends with ``register(XModel())``."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol, runtime_checkable

import numpy as np

from forecast_service.preprocess import CleanSeries
from forecast_service.schemas import ForecastWarning


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str
    description: str
    version: str
    min_history_days: int
    recommended_horizons: list[int]
    supports_holidays: bool
    internal: bool = False
    """Internal models are runnable but hidden from ``GET /models``."""
    sort_order: int = 100
    """Catalog position (ascending) in ``GET /models``; the UI defaults to the first two."""


@dataclass
class RunContext:
    country: str | None
    uncertainty_samples: int = 300
    seed: int = 42
    warnings: list[ForecastWarning] = field(default_factory=list)

    def warn(self, code: str, message: str, **details: object) -> None:
        if any(w.code == code for w in self.warnings):
            return
        self.warnings.append(ForecastWarning(code=code, message=message, details=details or None))


@dataclass
class ModelOutput:
    ds: list[date]
    yhat: np.ndarray
    bands: dict[int, tuple[np.ndarray, np.ndarray]]
    """``{level: (lower, upper)}`` aligned with ``yhat``."""
    fitted: np.ndarray | None
    """In-sample prediction aligned with ``series.ds`` (NaN where unavailable)."""
    components: dict[str, np.ndarray] | None
    """Optional. Known keys: ``weekday_uplift_pct`` (7 values, Mon..Sun) and
    ``holiday_effect_pct`` (one per horizon day)."""
    notes: list[str]
    holidays_used: bool = False
    yearly_seasonality_used: bool = False


@runtime_checkable
class ForecastModel(Protocol):
    info: ModelInfo

    def fit_predict(
        self, series: CleanSeries, horizon: int, level: list[int], ctx: RunContext
    ) -> ModelOutput: ...
