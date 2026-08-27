"""The wire contract is camelCase and frozen by a JSON-schema snapshot."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from forecast_service.core import run_forecast
from forecast_service.schemas import (
    ErrorResponse,
    ForecastRequest,
    ForecastResult,
    ModelInfoSchema,
)
from pydantic import ValidationError

SNAPSHOT = Path(__file__).parent / "snapshots" / "forecast_result.schema.json"
CAMEL = re.compile(r"^[a-z][a-zA-Z0-9]*$")


def _walk_keys(obj, found: set[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k)
            _walk_keys(v, found)
    elif isinstance(obj, list):
        for v in obj:
            _walk_keys(v, found)


def test_result_schema_matches_snapshot() -> None:
    current = ForecastResult.model_json_schema(by_alias=True)
    expected = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert current == expected, (
        "ForecastResult schema changed. If intended, regenerate tests/snapshots/"
        "forecast_result.schema.json and update forecast-types.ts in the SvelteKit app."
    )


def test_result_keys_are_camel_case(series_120) -> None:
    result = run_forecast(
        ForecastRequest(model_id="seasonal_naive", horizon_days=7, series=series_120)
    )
    payload = result.model_dump(by_alias=True, mode="json")
    keys: set[str] = set()
    _walk_keys(payload, keys)
    assert all(CAMEL.match(k) for k in keys), sorted(k for k in keys if not CAMEL.match(k))
    assert {"modelId", "horizonDays", "cutoffDate", "trendPctPer30d", "generatedAt"} <= set(payload)
    assert set(payload["forecast"][0]) == {"ds", "yhat", "lo80", "hi80", "lo95", "hi95"}
    assert set(payload["history"][0]) == {"ds", "y", "fitted"}
    assert payload["seasonality"]["strongestWeekday"]
    assert isinstance(payload["seasonality"]["notes"], list)


def test_request_accepts_camel_and_snake_but_forbids_unknown(series_120) -> None:
    wire = [{"ds": p.ds.isoformat(), "y": p.y} for p in series_120]
    camel = ForecastRequest.model_validate({"modelId": "x", "horizonDays": 7, "series": wire})
    snake = ForecastRequest.model_validate({"model_id": "x", "horizon_days": 7, "series": wire})
    assert camel == snake
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"modelId": "x", "series": wire, "unexpected": 1})
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"modelId": "x", "horizonDays": 91, "series": wire})
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"modelId": "x", "series": []})


def test_model_info_and_error_are_camel() -> None:
    info = ModelInfoSchema(
        id="a", name="A", description="d", version="1", min_history_days=60,
        recommended_horizons=[7], supports_holidays=True,
    ).model_dump(by_alias=True)
    assert set(info) == {
        "id", "name", "description", "version", "minHistoryDays", "recommendedHorizons",
        "supportsHolidays",
    }
    err = ErrorResponse.model_validate(
        {"error": {"code": "BUSY", "message": "m", "details": None}}
    ).model_dump(by_alias=True)
    assert err == {"error": {"code": "BUSY", "message": "m", "details": None}}
