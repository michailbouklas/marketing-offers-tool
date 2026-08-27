"""The CLI is the same engine as the API: identical JSON minus timing fields."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
from forecast_service.api import create_app

from tests.conftest import TEST_ENV, make_request

ROOT = Path(__file__).resolve().parents[1]
VOLATILE = {"runtimeMs", "generatedAt"}


def run_cli(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "forecast_service", *args],
        input=stdin,
        capture_output=True,
        text=True,
        cwd=ROOT,
        env={**os.environ, **TEST_ENV},
        check=False,
    )


def test_list_models_matches_registry() -> None:
    proc = run_cli("--list-models")
    assert proc.returncode == 0, proc.stderr
    ids = [m["id"] for m in json.loads(proc.stdout)]
    assert ids == ["seasonal_trend", "statistical_baseline"]
    with_internal = json.loads(run_cli("--list-models", "--include-internal").stdout)
    assert "seasonal_naive" in {m["id"] for m in with_internal}


async def test_stdin_output_equals_api_output(monkeypatch, series_120) -> None:
    body = make_request(series_120, model_id="seasonal_naive", horizon=7)
    proc = run_cli("--stdin", stdin=json.dumps(body))
    assert proc.returncode == 0, proc.stderr
    cli_result = json.loads(proc.stdout)

    monkeypatch.setenv("FORECAST_ALLOW_NO_AUTH", "1")
    monkeypatch.setenv("FORECAST_SERVICE_TOKEN", "")
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            api_result = (await client.post("/forecast", json=body)).json()

    strip = lambda d: {k: v for k, v in d.items() if k not in VOLATILE}  # noqa: E731
    assert strip(cli_result) == strip(api_result)


def test_stdin_error_envelope_and_exit_code(series_40) -> None:
    proc = run_cli("--stdin", stdin=json.dumps(make_request(series_40)))
    assert proc.returncode == 2
    assert json.loads(proc.stdout)["error"]["code"] == "INSUFFICIENT_HISTORY"

    proc = run_cli("--stdin", stdin="not json")
    assert proc.returncode == 2
    assert json.loads(proc.stdout)["error"]["code"] == "INVALID_REQUEST"
