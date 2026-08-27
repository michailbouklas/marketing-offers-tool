"""CLI adapter: the same engine over stdin/stdout, for an ``execFile`` transport.

    python -m forecast_service --stdin < request.json   # prints ForecastResult or error envelope
    python -m forecast_service --list-models
    python -m forecast_service --warmup

Exit codes: 0 ok, 1 engine failure, 2 bad input, 3 timeout/busy.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from typing import Any

from pydantic import ValidationError

from forecast_service.errors import ForecastError
from forecast_service.schemas import ForecastRequest, ModelInfoSchema


def _emit(payload: Any, pretty: bool) -> None:
    indent = 2 if pretty else None
    sys.stdout.write(json.dumps(payload, indent=indent, default=str))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _run_stdin(pretty: bool) -> int:
    from forecast_service.core import run_forecast

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        err = ForecastError("INVALID_REQUEST", f"stdin is not valid JSON: {exc.msg}")
        _emit(err.envelope(), pretty)
        return err.exit_code
    try:
        req = ForecastRequest.model_validate(payload)
    except ValidationError as exc:
        err = ForecastError(
            "INVALID_REQUEST",
            "The request does not match the forecast contract.",
            {"errors": json.loads(exc.json(include_url=False))},
        )
        _emit(err.envelope(), pretty)
        return err.exit_code
    try:
        result = run_forecast(req)
    except ForecastError as exc:
        _emit(exc.envelope(), pretty)
        return exc.exit_code
    _emit(result.model_dump(by_alias=True, mode="json"), pretty)
    return 0


def _list_models(include_internal: bool, pretty: bool) -> int:
    from forecast_service.models.registry import list_models

    infos = [
        ModelInfoSchema.model_validate(asdict(info)).model_dump(by_alias=True)
        for info in list_models(include_internal=include_internal)
    ]
    _emit(infos, pretty)
    return 0


def _warmup(pretty: bool) -> int:
    from forecast_service.warmup import warmup

    ids = warmup()
    _emit({"warmed": ids}, pretty)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="forecast_service", description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--stdin", action="store_true", help="read a ForecastRequest JSON from stdin")
    mode.add_argument("--list-models", action="store_true", help="print the public model catalog")
    mode.add_argument("--warmup", action="store_true", help="fit every public model once")
    parser.add_argument("--include-internal", action="store_true", help="with --list-models")
    parser.add_argument("--pretty", action="store_true", help="indent the JSON output")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.list_models:
        return _list_models(args.include_internal, args.pretty)
    if args.warmup:
        return _warmup(args.pretty)
    return _run_stdin(args.pretty)
