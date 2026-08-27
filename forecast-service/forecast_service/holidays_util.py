"""Public-holiday helpers built on the ``holidays`` package with graceful fallback."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from functools import lru_cache

import pandas as pd


@lru_cache(maxsize=32)
def _country_holidays(country: str, years: tuple[int, ...]) -> dict[date, str] | None:
    import holidays as holidays_lib

    try:
        table = holidays_lib.country_holidays(country.upper(), years=list(years))
    except (NotImplementedError, KeyError, ValueError, AttributeError):
        return None
    return {d: str(name) for d, name in sorted(table.items())}


def holidays_for(country: str | None, years: Iterable[int]) -> dict[date, str] | None:
    """``{date: name}`` for the country/years, or ``None`` when the country is unsupported."""
    if not country:
        return None
    return _country_holidays(country, tuple(sorted(set(years))))


def prophet_holidays_df(country: str | None, years: Iterable[int]) -> pd.DataFrame | None:
    """Prophet's own ``make_holidays_df`` wrapped so an unsupported country yields ``None``."""
    if not country:
        return None
    try:
        from prophet.make_holidays import make_holidays_df

        frame = make_holidays_df(year_list=sorted(set(years)), country=country.upper())
    except Exception:
        return None
    if frame is None or frame.empty:
        return None
    return frame


def upcoming_holidays(country: str | None, dates: pd.DatetimeIndex) -> list[tuple[date, str]]:
    if len(dates) == 0:
        return []
    table = holidays_for(country, {d.year for d in dates})
    if not table:
        return []
    wanted = {d.date() for d in dates}
    return [(d, name) for d, name in table.items() if d in wanted]
