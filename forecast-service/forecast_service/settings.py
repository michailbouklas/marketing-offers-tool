"""Runtime settings (env-driven) and process-wide environment defaults.

Every knob is prefixed ``FORECAST_`` so it can live next to the SvelteKit
variables in the shared ``.env``.
"""

from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# The service shares the SvelteKit app's ``.env`` at the repository root
# (``forecast-service/forecast_service/settings.py`` -> repo root is two levels up).
# A ``forecast-service/.env`` may override it; real process env always wins.
# Missing files are ignored, so the Docker image (which gets its env from compose)
# is unaffected.
_SERVICE_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SERVICE_DIR.parent
ENV_FILES: tuple[str, ...] = (
    str(_REPO_ROOT / ".env"),
    str(_SERVICE_DIR / ".env"),
)

# Numerical libraries default to one thread per *library*; the ProcessPoolExecutor
# provides parallelism across requests instead. Only set when the caller has not.
THREAD_ENV_DEFAULTS: dict[str, str] = {
    "OMP_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "NUMBA_NUM_THREADS": "1",
    "NIXTLA_ID_AS_COL": "1",
    "MPLBACKEND": "Agg",
}


def apply_thread_env_defaults() -> None:
    for key, value in THREAD_ENV_DEFAULTS.items():
        os.environ.setdefault(key, value)


apply_thread_env_defaults()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FORECAST_",
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    workers: int = Field(default=3, ge=1, le=32)
    timeout_s: float = Field(default=60.0, gt=0)
    max_inflight: int = Field(default=6, ge=1)
    service_token: str = ""
    default_country: str = "CY"
    allow_no_auth: bool = False
    # Prophet Monte-Carlo samples used for the bands. Tests lower this for speed.
    uncertainty_samples: int = Field(default=300, ge=20)
    # Run forecasts on a thread pool inside the API process instead of a process pool
    # (tests / single-shot debugging only).
    inline_executor: bool = False


def get_settings() -> Settings:
    """Fresh settings on every call; constructing a BaseSettings is cheap and tests mutate env."""
    return Settings()
