from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from forecast_service.api import create_app

from tests.conftest import PUBLIC_MODEL_IDS, make_request


@asynccontextmanager
async def client_for(monkeypatch, token: str = "") -> AsyncIterator[httpx.AsyncClient]:
    monkeypatch.setenv("FORECAST_SERVICE_TOKEN", token)
    monkeypatch.setenv("FORECAST_ALLOW_NO_AUTH", "0" if token else "1")
    monkeypatch.setenv("FORECAST_INLINE_EXECUTOR", "1")
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


async def test_health_reports_warm_and_needs_no_token(monkeypatch) -> None:
    async with client_for(monkeypatch, token="s3cret") as client:
        r = await client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok" and body["modelsWarm"] is True
        assert isinstance(body["engineVersion"], str)


async def test_models_lists_public_catalog(monkeypatch) -> None:
    async with client_for(monkeypatch) as client:
        r = await client.get("/models")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        assert [m["id"] for m in body] == PUBLIC_MODEL_IDS
        assert set(body[0]) == {
            "id", "name", "description", "version", "minHistoryDays", "recommendedHorizons",
            "supportsHolidays",
        }


async def test_missing_or_wrong_token_is_401(monkeypatch, series_120) -> None:
    async with client_for(monkeypatch, token="s3cret") as client:
        r = await client.get("/models")
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "UNAUTHORIZED"
        r = await client.post(
            "/forecast", json=make_request(series_120), headers={"Authorization": "Bearer nope"}
        )
        assert r.status_code == 401
        r = await client.get("/models", headers={"Authorization": "Bearer s3cret"})
        assert r.status_code == 200


async def test_refuses_to_start_without_token_unless_allowed(monkeypatch) -> None:
    monkeypatch.setenv("FORECAST_SERVICE_TOKEN", "")
    monkeypatch.setenv("FORECAST_ALLOW_NO_AUTH", "0")
    app = create_app()
    with pytest.raises(RuntimeError, match="FORECAST_SERVICE_TOKEN"):
        async with app.router.lifespan_context(app):
            pass


async def test_unknown_model_is_404(monkeypatch, series_120) -> None:
    async with client_for(monkeypatch) as client:
        r = await client.post("/forecast", json=make_request(series_120, model_id="nope"))
        assert r.status_code == 404
        body = r.json()["error"]
        assert body["code"] == "UNKNOWN_MODEL"
        assert "seasonal_trend" in body["details"]["available"]


async def test_insufficient_history_is_422(monkeypatch, series_40) -> None:
    async with client_for(monkeypatch) as client:
        r = await client.post("/forecast", json=make_request(series_40, model_id="seasonal_trend"))
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "INSUFFICIENT_HISTORY"


async def test_invalid_request_is_422_envelope(monkeypatch, series_120) -> None:
    async with client_for(monkeypatch) as client:
        r = await client.post("/forecast", json={**make_request(series_120), "bogus": 1})
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "INVALID_REQUEST"


async def test_happy_path(monkeypatch, series_120) -> None:
    async with client_for(monkeypatch) as client:
        r = await client.post(
            "/forecast", json=make_request(series_120, model_id="statistical_baseline", horizon=7)
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["modelId"] == "statistical_baseline"
        assert body["modelName"] == "Statistical Baseline"
        assert len(body["forecast"]) == 7
        assert body["accuracy"]["grade"] in {"high", "medium", "low"}
        assert body["summary"]["samePeriodLastYear"] is None  # only 120 days
        assert body["seasonality"]["strongestWeekday"] == "Saturday"
        assert {w["code"] for w in body["warnings"]} >= {"INSUFFICIENT_FOR_YEARLY"}


async def test_timeout_maps_to_504(monkeypatch, series_120) -> None:
    monkeypatch.setenv("FORECAST_TIMEOUT_S", "0.001")
    async with client_for(monkeypatch) as client:
        r = await client.post("/forecast", json=make_request(series_120, horizon=7))
        assert r.status_code == 504
        assert r.json()["error"]["code"] == "TIMEOUT"
