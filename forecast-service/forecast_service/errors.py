"""Typed engine errors mapped to HTTP statuses (API) and exit codes (CLI)."""

from __future__ import annotations

from typing import Any

HTTP_STATUS: dict[str, int] = {
    "INSUFFICIENT_HISTORY": 422,
    "INVALID_SERIES": 422,
    "INVALID_REQUEST": 422,
    "UNKNOWN_MODEL": 404,
    "UNAUTHORIZED": 401,
    "BUSY": 429,
    "TIMEOUT": 504,
    "MODEL_FAILED": 500,
}

# CLI: 0 ok, 1 engine failure, 2 bad input, 3 timeout / busy.
EXIT_CODE: dict[str, int] = {
    "INSUFFICIENT_HISTORY": 2,
    "INVALID_SERIES": 2,
    "INVALID_REQUEST": 2,
    "UNKNOWN_MODEL": 2,
    "UNAUTHORIZED": 2,
    "BUSY": 3,
    "TIMEOUT": 3,
    "MODEL_FAILED": 1,
}


class ForecastError(Exception):
    """Raised anywhere in the engine; picklable so it survives the process pool."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, details)
        self.code = code
        self.message = message
        self.details = details

    @property
    def http_status(self) -> int:
        return HTTP_STATUS.get(self.code, 500)

    @property
    def exit_code(self) -> int:
        return EXIT_CODE.get(self.code, 1)

    def envelope(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"
