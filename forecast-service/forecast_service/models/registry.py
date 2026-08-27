"""Model registry. ``GET /models`` and the CLI read from here; the UI never hard-codes ids."""

from __future__ import annotations

from forecast_service.errors import ForecastError
from forecast_service.models.base import ForecastModel, ModelInfo

_REGISTRY: dict[str, ForecastModel] = {}


def register(model: ForecastModel) -> ForecastModel:
    model_id = model.info.id
    if model_id in _REGISTRY and _REGISTRY[model_id] is not model:
        raise ValueError(f"model id {model_id!r} is already registered")
    _REGISTRY[model_id] = model
    return model


def get_model(model_id: str) -> ForecastModel:
    _ensure_loaded()
    try:
        return _REGISTRY[model_id]
    except KeyError:
        known = [m.id for m in list_models()]
        raise ForecastError(
            "UNKNOWN_MODEL",
            f"Unknown model '{model_id}'.",
            {"modelId": model_id, "available": known},
        ) from None


def list_models(include_internal: bool = False) -> list[ModelInfo]:
    _ensure_loaded()
    return [m.info for m in _REGISTRY.values() if include_internal or not m.info.internal]


def _ensure_loaded() -> None:
    # Importing the package imports every model module, which self-registers.
    import forecast_service.models  # noqa: F401
