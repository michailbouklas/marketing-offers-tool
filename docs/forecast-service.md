# Forecast service (Python sidecar)

`forecast-service/` is a stateless FastAPI engine that turns a brand's daily sales
series into a forecast with uncertainty bands, an accuracy grade and plain-English
notes. It never touches a database: SvelteKit resolves the brand scope, pulls the
daily series from ClickHouse (`src/lib/services/forecasts/forecast-series.server.ts`)
and POSTs it here (`forecast-engine.server.ts`). Each model runs in its own process-pool
worker, so one slow or failing model never blocks another.

- Package: `forecast-service/` (Python 3.12, managed with [uv](https://docs.astral.sh/uv/))
- Compose service: `forecast` (internal network, `http://forecast:8000`)
- UI: `/forecasts` (see Plans / the sales-forecasts spec)

## Running

### Local development (one command for both stacks)

```bash
bun run forecast:setup   # once: installs uv if missing, `uv sync` in forecast-service/
bun run dev:all          # SvelteKit (vite) + forecast service with --reload on :8000
```

`bun run dev:all` uses `concurrently` to run `bun run dev` and `bun run forecast:dev`
(`uv run uvicorn forecast_service.api:app --reload --port 8000`). For local dev set
`FORECAST_ALLOW_NO_AUTH=1` in `.env` so no bearer token is needed; the service
**refuses to start** with an empty `FORECAST_SERVICE_TOKEN` otherwise.

The service reads its `FORECAST_*` settings from the process environment first, then
from the repository-root `.env` (shared with SvelteKit) and finally from an optional
`forecast-service/.env` — so `bun run forecast:dev` / `dev:all` need no extra exports.
In Docker the env comes from compose; the files are simply absent there.

Frontend-only developers can run the sidecar in Docker instead of installing Python:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build forecast
bun run dev
```

Other scripts: `bun run forecast:test` (pytest), `bun run forecast:dev` (service only).

### Production

`docker compose up --build` builds both images. `app` waits for `forecast` to report
healthy (`depends_on: condition: service_healthy`); `forecast` is only `expose`d, never
published. `app` gets `FORECAST_SERVICE_URL=http://forecast:8000`; both containers read
the shared `.env` so `FORECAST_SERVICE_TOKEN` matches on both sides.

The image (`forecast-service/Dockerfile`) is `python:3.12-slim` + uv, non-root user
`app`, dependencies installed from `uv.lock` (`--frozen --no-dev`), and runs
`python -m forecast_service --warmup` at build time so Prophet's Stan binary and the
statsforecast numba kernels are exercised once and cached in the layer.

## Environment variables

Read by the Python service (prefix `FORECAST_`):

| Variable                       | Default | Meaning                                                         |
| ------------------------------ | ------- | --------------------------------------------------------------- |
| `FORECAST_SERVICE_TOKEN`       | `""`    | Shared secret; requests send `Authorization: Bearer <token>`    |
| `FORECAST_ALLOW_NO_AUTH`       | `0`     | `1` lets the service start with an empty token (local dev only) |
| `FORECAST_WORKERS`             | `3`     | Process-pool size (one model fit per worker at a time)          |
| `FORECAST_TIMEOUT_S`           | `60`    | Per-request budget; exceeded -> `504 TIMEOUT`                   |
| `FORECAST_MAX_INFLIGHT`        | `6`     | Concurrent requests admitted; more -> `429 BUSY`                |
| `FORECAST_DEFAULT_COUNTRY`     | `CY`    | Holiday calendar when the request omits `country`               |
| `FORECAST_UNCERTAINTY_SAMPLES` | `300`   | Prophet Monte-Carlo samples for the bands (tests use 60)        |
| `FORECAST_INLINE_EXECUTOR`     | `0`     | Thread pool instead of process pool (tests/debugging only)      |

Read by SvelteKit (see `.env.example`): `FORECAST_SERVICE_URL`, `FORECAST_SERVICE_TOKEN`,
`FORECAST_TIMEOUT_MS` (keep it above `FORECAST_TIMEOUT_S * 1000`), `FORECAST_HISTORY_DAYS`,
`FORECAST_CACHE_TTL_MS`, `FORECAST_MODELS_TTL_MS`, `FORECAST_DEFAULT_COUNTRY`.

The image also pins `OMP/MKL/OPENBLAS/NUMBA_NUM_THREADS=1`, `NUMBA_CACHE_DIR`,
`NIXTLA_ID_AS_COL=1`, `MPLBACKEND=Agg`; `settings.py` applies the same defaults when unset.

## Wire contract

All JSON is **camelCase** (pydantic `alias_generator=to_camel`), mirrored 1:1 by Zod in
`src/lib/services/forecasts/forecast-types.ts`. The `ForecastResult` JSON schema is
snapshotted in `forecast-service/tests/snapshots/forecast_result.schema.json`; the test
fails when the contract drifts, which is the cue to update the Zod mirror.

### `GET /health` (no auth)

```json
{ "status": "ok", "modelsWarm": true, "engineVersion": "0.1.0" }
```

`503` with `"status": "starting"` until every pool worker has run its warm-up.

### `GET /models` (Bearer)

Bare array of public models — the UI never hard-codes ids:

```json
[{ "id": "seasonal_trend", "name": "Seasonal Trend", "description": "...", "version": "1.0.0",
   "minHistoryDays": 60, "recommendedHorizons": [7, 14, 30, 90], "supportsHolidays": true }, ...]
```

### `POST /forecast` (Bearer)

Request (`extra` fields are rejected; the series may be **sparse** — days with no rows
are treated as zero sales, never interpolated):

```jsonc
{ "modelId": "seasonal_trend", "horizonDays": 30, "country": "CY", "backtestFolds": 1,
  "seriesLabel": "bk",
  "series": [{ "ds": "2023-09-01", "y": 12345.67, "orders": 812 }, ...] }   // 1..3660 rows; horizon 1..90
```

Response `200`:

```jsonc
{ "modelId", "modelName", "modelVersion", "engineVersion", "horizonDays", "cutoffDate",
  "history":  [{ "ds", "y", "fitted": number|null }],            // last max(365, 2*horizon) days
  "forecast": [{ "ds", "yhat", "lo80", "hi80", "lo95", "hi95" }], // all >= 0, lo95<=lo80<=yhat<=hi80<=hi95
  "summary":  { "horizonTotal", "horizonLower80", "horizonUpper80",
                "samePeriodLastYear": number|null, "vsLastYearPct": number|null,   // null unless >= 365+horizon days
                "trailingPeriodTotal", "vsTrailingPct", "averageDaily",
                "peakDay", "peakDayValue", "lowDay", "lowDayValue", "averageOrderValue": number|null },
  "accuracy": { "holdoutDays", "folds", "wapePct", "mapePct": number|null, "mae", "biasPct",
                "coverage80Pct": number|null, "grade": "high"|"medium"|"low", "gradeLabel" } | null,
  "trendDirection": "up"|"flat"|"down", "trendPctPer30d",
  "seasonality": { "strongestWeekday", "weakestWeekday", "weekdayUpliftPct",
                   "yearlySeasonalityUsed", "holidaysUsed",
                   "upcomingHolidays": [{ "ds", "name", "expectedEffectPct": number|null }],
                   "notes": ["Saturdays are typically 28% busier than the weekly average.", ...] },
  "warnings": [{ "code", "message", "details" }], "runtimeMs", "generatedAt" }
```

Accuracy grade: WAPE `<= 12` -> `high`, `<= 25` -> `medium`, else `low` (`gradeLabel`:
"High/Moderate/Low confidence"). The holdout is `min(horizon, 28, n/5)` days, scored with
the same code for every model so grades are comparable. Trend: slope over the last 90
fitted days plus the horizon, expressed as % of level per 30 days; within ±3 % is `flat`.

Warning codes: `GAPS_FILLED`, `CLOSURE_PERIOD` (>= 7 consecutive zero days), `NEGATIVE_CLIPPED`,
`OUTLIERS_DETECTED` (flag only), `INSUFFICIENT_FOR_YEARLY` (< 400 days), `HORIZON_LONG_FOR_HISTORY`
(horizon > days/3), `HOLIDAYS_UNAVAILABLE`, `BACKTEST_SKIPPED`.

### Errors

```json
{
  "error": {
    "code": "INSUFFICIENT_HISTORY",
    "message": "…",
    "details": { "days": 41, "required": 60 }
  }
}
```

| Code                   | HTTP | When                                                     |
| ---------------------- | ---- | -------------------------------------------------------- |
| `UNAUTHORIZED`         | 401  | Missing/invalid bearer token                             |
| `UNKNOWN_MODEL`        | 404  | `modelId` not registered (`details.available` lists ids) |
| `INVALID_REQUEST`      | 422  | Body does not match the contract                         |
| `INVALID_SERIES`       | 422  | Unsorted/duplicate dates, non-finite `y`, no sales       |
| `INSUFFICIENT_HISTORY` | 422  | Fewer than 56 usable days, or fewer than the model needs |
| `BUSY`                 | 429  | `FORECAST_MAX_INFLIGHT` requests already running         |
| `MODEL_FAILED`         | 500  | The model raised; `details.error` has the message        |
| `TIMEOUT`              | 504  | Exceeded `FORECAST_TIMEOUT_S`                            |

## CLI (execFile escape hatch)

The same engine without HTTP, for a future `execFile` transport:

```bash
uv run python -m forecast_service --stdin < request.json   # ForecastResult or error envelope on stdout
uv run python -m forecast_service --list-models [--include-internal]
uv run python -m forecast_service --warmup
```

Exit codes: `0` ok, `1` engine failure, `2` bad input (404/422 class), `3` timeout/busy.
`tests/test_cli.py` asserts CLI output equals API output.

## Models

| id                     | Name                 | Library                                                                                                                                  | Needs   | Holidays                               |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------- |
| `seasonal_trend`       | Seasonal Trend       | Prophet, weekly + yearly (>= 400 days), multiplicative, `changepoint_prior_scale=0.05`; both bands from `predictive_samples` percentiles | 60 days | yes (`make_holidays_df`, default `CY`) |
| `statistical_baseline` | Statistical Baseline | statsforecast `MSTL(season_length=[7,365] if >= 730 days else [7], trend_forecaster=AutoETS("ZZN"))`, `fallback_model=SeasonalNaive(7)`  | 60 days | no                                     |
| `seasonal_naive`       | (internal)           | Same-weekday average of the last 4 weeks; reference / template                                                                           | 56 days | no                                     |

Data hygiene before any model runs (`preprocess.py`): validate -> trim leading zero
days -> reindex to a complete daily calendar (missing = 0) -> clip negatives -> closures
(>= 7 zero days) become NaN for Prophet / interpolated for statsforecast -> outliers
flagged -> minimum 56 days.

### Adding a model

1. Create `forecast_service/models/<your_model>.py`:

   ```python
   from forecast_service.models.base import ModelInfo, ModelOutput, RunContext
   from forecast_service.models.registry import register
   from forecast_service.preprocess import CleanSeries

   class MyModel:
       info = ModelInfo(id="my_model", name="My Model", description="One line for the card.",
                        version="1.0.0", min_history_days=60, recommended_horizons=[7, 14, 30],
                        supports_holidays=False)

       def fit_predict(self, series: CleanSeries, horizon: int, level: list[int],
                       ctx: RunContext) -> ModelOutput:
           # series.y (zeros kept), series.y_nan_closures (Prophet-style), series.y_interp (dense)
           # heavy imports go here so warm-up triggers them
           ...
           return ModelOutput(ds=[...], yhat=yhat, bands={80: (lo80, hi80), 95: (lo95, hi95)},
                              fitted=fitted_or_none, components=None, notes=[])

   register(MyModel())
   ```

   Optional `components`: `weekday_uplift_pct` (7 values Mon..Sun) and
   `holiday_effect_pct` (per horizon day) feed the seasonality notes; otherwise they are
   derived from history. Call `ctx.warn(code, message, **details)` for warnings.

2. Add one import line in `forecast_service/models/__init__.py`.
3. Run `uv run pytest -q` — `test_models_recover_signal.py` automatically covers every
   registered model (Saturday peak recovered, WAPE < 15 %, bands ordered, length == horizon).

No API, CLI, compose or UI change is needed: `GET /models` and the checkbox cards read
the registry. `seasonal_naive.py` is the minimal reference implementation.

## Concurrency and limits

uvicorn runs one process. `POST /forecast` runs `run_forecast_json` in a
`ProcessPoolExecutor(max_workers=FORECAST_WORKERS, initializer=warmup, max_tasks_per_child=200)`
(spawn context). An `asyncio.Semaphore(FORECAST_MAX_INFLIGHT)` rejects excess requests with
`429 BUSY` instead of queueing; `asyncio.wait_for(FORECAST_TIMEOUT_S)` maps to `504 TIMEOUT`
(the worker finishes its fit in the background). `/health` stays `503` until every worker
has completed its warm-up fit; compose only starts `app` after that.

Typical cost per request with a 3-year daily series: Prophet ≈ 1–3 s (2 fits: backtest +
final), MSTL ≈ 0.3–1 s. Memory: ~300–500 MB per warm worker (`mem_limit: 2g` for 3 workers).

## Testing

```bash
bun run forecast:test                 # == cd forecast-service && uv run pytest -q
cd forecast-service && uv run ruff check .
```

Tests use short synthetic series (`forecast_service.warmup.synthetic_series`),
`FORECAST_UNCERTAINTY_SAMPLES=60` and `FORECAST_INLINE_EXECUTOR=1` (set in `tests/conftest.py`).

## Troubleshooting

- **`uv: command not found` after `pip install uv`** — pip installed it into Python's
  `Scripts` directory that is not on PATH (common with `pip install --user` on Windows).
  `bun run forecast:setup` prints the directory; add it to PATH or use
  `winget install astral-sh.uv`.
- **Service exits immediately with `FORECAST_SERVICE_TOKEN is empty`** — set the token, or
  `FORECAST_ALLOW_NO_AUTH=1` for local dev.
- **`/health` stays 503** — warm-up is still running (Prophet's first fit per worker takes a
  few seconds); check container logs for a `MODEL_FAILED`/import error.
- **Prophet prints "Importing plotly failed"** — harmless; plotting is not used.
