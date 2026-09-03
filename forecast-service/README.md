# forecast-service

Stateless sales-forecast engine for marketing-offers-tool. JSON in (a daily series),
JSON out (forecast, bands, plain-English summary). No database credentials — the
SvelteKit app queries ClickHouse and POSTs the series here.

Full documentation (wire contract, env vars, ops, adding a model): `../docs/forecast-service.md`.

## Quick start

```bash
# from the repo root
bun run forecast:setup        # installs uv if needed, then `uv sync` here
bun run forecast:setup:foundation  # same + the optional TimesFM extra (CPU torch, ~750 MB)
bun run dev:all               # SvelteKit + this service (http://localhost:8000)

# or directly, from this directory
FORECAST_ALLOW_NO_AUTH=1 uv run uvicorn forecast_service.api:app --reload --port 8000
uv run pytest -q
uv run ruff check .
```

## Endpoints

| Method | Path        | Auth   | Purpose                                               |
| ------ | ----------- | ------ | ----------------------------------------------------- |
| GET    | `/health`   | none   | `{status, modelsWarm, engineVersion}`; 503 until warm |
| GET    | `/models`   | Bearer | Public model catalog (camelCase `ModelInfo[]`)        |
| POST   | `/forecast` | Bearer | Run one model on one series                           |

## CLI (same engine, no HTTP)

```bash
uv run python -m forecast_service --list-models
uv run python -m forecast_service --stdin < request.json
uv run python -m forecast_service --warmup
```

## Layout

```
forecast_service/
  api.py          FastAPI app: lifespan (process pool + warm-up), auth, routes
  cli.py          --stdin | --list-models | --warmup
  core.py         run_forecast(): preprocess -> backtest -> fit -> summarize
  preprocess.py   sparse series -> complete daily calendar (+ warning codes)
  backtest.py     shared holdout scoring (WAPE grade) for every model
  summarize.py    totals, comparisons, trend, weekday/holiday sentences
  models/         one file per model; registry.py; base.py (plugin contract)
                  foundation_timesfm.py registers only with FORECAST_FOUNDATION_ENABLED=1
tests/            pytest (fast synthetic series)
```
