"""Importing this package imports every model module, which self-registers.

To add a model: create ``models/<name>.py`` ending in ``register(YourModel())``
and add one import line below. Nothing else changes (API, CLI, UI read the registry).
"""

from forecast_service.models import (  # noqa: F401
    prophet_seasonal_trend,
    seasonal_naive,
    stats_baseline,
)
