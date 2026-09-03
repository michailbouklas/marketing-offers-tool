# syntax=docker/dockerfile:1.7
# Stateless forecast engine. Built from ./forecast-service as the compose `forecast` service.

# ---------------------------------------------------------------- deps
FROM python:3.12-slim AS deps
# Pin the uv major/minor that produced uv.lock (see .python-version / pyproject).
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra foundation

# ---------------------------------------------------------------- runtime
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    NUMBA_NUM_THREADS=1 \
    NUMBA_CACHE_DIR=/home/app/.numba \
    NIXTLA_ID_AS_COL=1 \
    MPLBACKEND=Agg \
    HF_HOME=/app/hf-cache \
    FORECAST_FOUNDATION_ENABLED=1 \
    PATH="/app/.venv/bin:$PATH"

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin app \
    && mkdir -p /home/app/.numba /app/hf-cache
WORKDIR /app
COPY --from=deps /app/.venv /app/.venv
COPY pyproject.toml README.md ./
COPY forecast_service ./forecast_service
RUN chown -R app:app /app /home/app
USER app

# Load the Stan binary once, bake the numba kernel cache into the layer and download the
# TimesFM 2.5 checkpoint (925 MB) into HF_HOME so the container never needs the network.
RUN python -m forecast_service --warmup
ENV HF_HUB_OFFLINE=1

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --retries=5 \
    CMD ["python", "-c", "import sys, urllib.request; r = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4); sys.exit(0 if r.status == 200 else 1)"]

CMD ["uvicorn", "forecast_service.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
