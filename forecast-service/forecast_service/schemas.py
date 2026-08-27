"""Wire contract. Every model here serialises camelCase (``by_alias=True``).

The SvelteKit side mirrors these 1:1 with Zod in ``forecast-types.ts``.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Grade = Literal["high", "medium", "low"]
TrendDirection = Literal["up", "flat", "down"]

WARNING_CODES: tuple[str, ...] = (
    "GAPS_FILLED",
    "CLOSURE_PERIOD",
    "NEGATIVE_CLIPPED",
    "OUTLIERS_DETECTED",
    "INSUFFICIENT_FOR_YEARLY",
    "HORIZON_LONG_FOR_HISTORY",
    "HOLIDAYS_UNAVAILABLE",
    "BACKTEST_SKIPPED",
    "FALLBACK_MODEL_USED",
)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
    )


# ---------------------------------------------------------------- request


class SeriesPoint(CamelModel):
    ds: date
    y: float
    orders: int | None = Field(default=None, ge=0)


class ForecastRequest(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
        extra="forbid",
    )

    model_id: str = Field(min_length=1, max_length=64)
    horizon_days: int = Field(default=30, ge=1, le=90)
    country: str | None = Field(default=None, min_length=2, max_length=8)
    backtest_folds: int = Field(default=1, ge=0, le=5)
    series_label: str | None = Field(default=None, max_length=128)
    series: list[SeriesPoint] = Field(min_length=1, max_length=3660)


# ---------------------------------------------------------------- result


class HistoryPoint(CamelModel):
    ds: date
    y: float
    fitted: float | None


class ForecastPoint(CamelModel):
    ds: date
    yhat: float
    lo80: float
    hi80: float
    lo95: float
    hi95: float


class ForecastSummary(CamelModel):
    horizon_total: float
    horizon_lower80: float
    horizon_upper80: float
    same_period_last_year: float | None
    vs_last_year_pct: float | None
    trailing_period_total: float
    vs_trailing_pct: float | None
    average_daily: float
    peak_day: date
    peak_day_value: float
    low_day: date
    low_day_value: float
    average_order_value: float | None


class ForecastAccuracy(CamelModel):
    holdout_days: int
    folds: int
    wape_pct: float
    mape_pct: float | None
    mae: float
    bias_pct: float
    coverage80_pct: float | None
    grade: Grade
    grade_label: str


class UpcomingHoliday(CamelModel):
    ds: date
    name: str
    expected_effect_pct: float | None


class ForecastSeasonality(CamelModel):
    strongest_weekday: str
    weakest_weekday: str
    weekday_uplift_pct: float
    yearly_seasonality_used: bool
    holidays_used: bool
    upcoming_holidays: list[UpcomingHoliday]
    notes: list[str]


class ForecastWarning(CamelModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ForecastResult(CamelModel):
    model_id: str
    model_name: str
    model_version: str
    engine_version: str
    horizon_days: int
    cutoff_date: date
    history: list[HistoryPoint]
    forecast: list[ForecastPoint]
    summary: ForecastSummary
    accuracy: ForecastAccuracy | None
    trend_direction: TrendDirection
    # to_camel would produce "trendPctPer30D"; the contract says "trendPctPer30d".
    trend_pct_per30d: float = Field(alias="trendPctPer30d")
    seasonality: ForecastSeasonality
    warnings: list[ForecastWarning]
    runtime_ms: int
    generated_at: datetime


# ---------------------------------------------------------------- catalog / errors / health


class ModelInfoSchema(CamelModel):
    id: str
    name: str
    description: str
    version: str
    min_history_days: int
    recommended_horizons: list[int]
    supports_holidays: bool


class ErrorBody(CamelModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(CamelModel):
    error: ErrorBody


class HealthResponse(CamelModel):
    status: Literal["ok", "starting"]
    models_warm: bool
    engine_version: str
