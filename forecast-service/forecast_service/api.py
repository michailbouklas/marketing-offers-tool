"""FastAPI sidecar: bearer auth, process pool, GET /health, GET /models, POST /forecast."""

from __future__ import annotations

import asyncio
import hmac
import logging
import multiprocessing
from concurrent.futures import Executor, ProcessPoolExecutor, ThreadPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import Any

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from forecast_service import ENGINE_VERSION
from forecast_service.core import run_forecast_json
from forecast_service.errors import ForecastError
from forecast_service.models.registry import list_models
from forecast_service.schemas import (
    ErrorResponse,
    ForecastRequest,
    ForecastResult,
    HealthResponse,
    ModelInfoSchema,
)
from forecast_service.settings import Settings, get_settings
from forecast_service.warmup import warmup

log = logging.getLogger("forecast_service")


def _noop() -> None:
    return None


def _build_executor(settings: Settings) -> Executor:
    if settings.inline_executor:
        return ThreadPoolExecutor(max_workers=settings.workers, thread_name_prefix="forecast")
    return ProcessPoolExecutor(
        max_workers=settings.workers,
        mp_context=multiprocessing.get_context("spawn"),
        initializer=warmup,
        max_tasks_per_child=200,
    )


async def _warm_pool(app: FastAPI) -> None:
    """Force every worker to spawn (and run its initializer) so /health flips to ok."""
    settings: Settings = app.state.settings
    loop = asyncio.get_running_loop()
    try:
        await asyncio.gather(
            *(loop.run_in_executor(app.state.executor, _noop) for _ in range(settings.workers))
        )
        app.state.warm = True
        log.info("forecast workers warm (%d)", settings.workers)
    except Exception as exc:
        app.state.warm_error = f"{type(exc).__name__}: {exc}"
        log.exception("forecast worker warm-up failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.service_token and not settings.allow_no_auth:
        raise RuntimeError(
            "FORECAST_SERVICE_TOKEN is empty. Set it, or set FORECAST_ALLOW_NO_AUTH=1 for "
            "local dev."
        )
    app.state.settings = settings
    app.state.semaphore = asyncio.Semaphore(settings.max_inflight)
    app.state.warm = False
    app.state.warm_error = None
    app.state.executor = _build_executor(settings)
    app.state.warm_task = None
    if settings.inline_executor:
        app.state.warm = True
    else:
        app.state.warm_task = asyncio.create_task(_warm_pool(app))
    try:
        yield
    finally:
        if app.state.warm_task is not None:
            app.state.warm_task.cancel()
        app.state.executor.shutdown(wait=False, cancel_futures=True)


async def require_token(
    request: Request, authorization: str | None = Header(default=None)
) -> None:
    settings: Settings = request.app.state.settings
    if not settings.service_token:
        if settings.allow_no_auth:
            return
        raise ForecastError("UNAUTHORIZED", "The service has no token configured.")
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token.strip().encode(), settings.service_token.encode()
    ):
        raise ForecastError("UNAUTHORIZED", "Missing or invalid bearer token.")


def _error_response(code: str, message: str, status: int, details: Any = None) -> JSONResponse:
    body = ErrorResponse.model_validate(
        {"error": {"code": code, "message": message, "details": details}}
    )
    return JSONResponse(status_code=status, content=body.model_dump(by_alias=True))


def create_app() -> FastAPI:
    app = FastAPI(
        title="forecast-service",
        version=ENGINE_VERSION,
        lifespan=lifespan,
        responses={"default": {"model": ErrorResponse}},
    )

    @app.exception_handler(ForecastError)
    async def _forecast_error(_: Request, exc: ForecastError) -> JSONResponse:
        return _error_response(exc.code, exc.message, exc.http_status, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {k: (str(v) if k == "ctx" else v) for k, v in e.items() if k != "url"}
            for e in exc.errors()
        ]
        return _error_response(
            "INVALID_REQUEST", "The request does not match the forecast contract.", 422,
            {"errors": errors},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error_response(f"HTTP_{exc.status_code}", str(exc.detail), exc.status_code)

    @app.get("/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
    async def health(request: Request) -> JSONResponse:
        warm = bool(request.app.state.warm)
        body = HealthResponse(
            status="ok" if warm else "starting", models_warm=warm, engine_version=ENGINE_VERSION
        )
        return JSONResponse(
            status_code=200 if warm else 503, content=body.model_dump(by_alias=True)
        )

    @app.get(
        "/models", response_model=list[ModelInfoSchema], dependencies=[Depends(require_token)]
    )
    async def models() -> list[ModelInfoSchema]:
        return [ModelInfoSchema.model_validate(asdict(info)) for info in list_models()]

    @app.post("/forecast", response_model=ForecastResult, dependencies=[Depends(require_token)])
    async def forecast(req: ForecastRequest, request: Request) -> Any:
        state = request.app.state
        settings: Settings = state.settings
        semaphore: asyncio.Semaphore = state.semaphore
        if semaphore.locked():
            raise ForecastError(
                "BUSY",
                "The forecast service is at capacity; retry shortly.",
                {"maxInflight": settings.max_inflight},
            )
        async with semaphore:
            loop = asyncio.get_running_loop()
            future = loop.run_in_executor(
                state.executor, run_forecast_json, req.model_dump(by_alias=True, mode="json")
            )
            try:
                return await asyncio.wait_for(future, timeout=settings.timeout_s)
            except TimeoutError:
                raise ForecastError(
                    "TIMEOUT",
                    f"{req.model_id} did not finish within {settings.timeout_s:g}s.",
                    {"modelId": req.model_id, "timeoutS": settings.timeout_s},
                ) from None
            except ForecastError:
                raise
            except BrokenProcessPool as exc:
                raise ForecastError(
                    "MODEL_FAILED", "A forecast worker crashed; the pool is restarting."
                ) from exc
            except Exception as exc:
                log.exception("forecast failed for %s", req.model_id)
                raise ForecastError(
                    "MODEL_FAILED",
                    f"{req.model_id} failed unexpectedly ({type(exc).__name__}).",
                    {"modelId": req.model_id},
                ) from exc

    return app


app = create_app()
