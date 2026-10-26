"""Build, validate, and serialise the files that `hailprint publish` writes under site/data/."""

import json
from collections.abc import Iterable
from datetime import UTC, date, datetime
from functools import cache
from importlib.metadata import version
from importlib.resources import files
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from hailprint import swath
from hailprint.files import FORBIDDEN_WORD
from hailprint.parcels import OWNER_FIELDS

Doc = dict[str, Any]
RECEIPT_KIND = "receipt"
RUN_TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
MESSAGE_CHARS = 200


@cache
def _schemas() -> dict[str, Doc]:
    """The committed schemas by file kind, read from the installed package."""
    folder = files("hailprint") / "schemas"
    suffix = ".schema.json"
    return {
        path.name.removesuffix(suffix): json.loads(path.read_text(encoding="utf-8"))
        for path in folder.iterdir()
        if path.name.endswith(suffix)
    }


@cache
def _validator(kind: str) -> Draft202012Validator:
    schemas = _schemas()
    if kind == RECEIPT_KIND or kind not in schemas:
        raise ValueError(f"unknown file kind {kind!r}")
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
    )
    return Draft202012Validator(schemas[kind], registry=registry)


def _json_path(parts: Iterable[str | int]) -> str:
    return "$" + "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in parts)


def validate(doc: Doc, kind: str) -> None:
    """Raise ValueError with the file kind and the JSON path when the document breaks its schema."""
    errors = sorted(
        _validator(kind).iter_errors(doc), key=lambda e: [str(p) for p in e.absolute_path]
    )
    if errors:
        message = errors[0].message
        if len(message) > MESSAGE_CHARS:
            message = f"{message[:80]} ... {message[-80:]}"
        raise ValueError(f"{kind}: {_json_path(errors[0].absolute_path)}: {message}")


def dumps(doc: Doc, kind: str) -> str:
    """Compact JSON text; NaN, Infinity, the forbidden word, or an owner field raises ValueError."""
    try:
        text = json.dumps(doc, allow_nan=False, separators=(",", ":"), ensure_ascii=False)
    except ValueError as err:
        raise ValueError(f"{kind}: {err}") from err
    lowered = text.lower()
    if FORBIDDEN_WORD in lowered:
        raise ValueError(f"{kind}: forbidden word {FORBIDDEN_WORD!r} in the text")
    for field in OWNER_FIELDS:
        if field.lower() in lowered:
            raise ValueError(f"{kind}: owner field {field!r} in the text")
    return text


def receipt(storm_date: date, sources: list[dict[str, str]], run_time: datetime) -> Doc:
    """The provenance block of one published file; `run_time` needs a time zone."""
    if run_time.tzinfo is None:
        raise ValueError("run_time needs a time zone")
    return {
        "storm_date": storm_date.isoformat(),
        "sources": [dict(source) for source in sources],
        "confidence": swath.CONFIDENCE,
        "run_time": run_time.astimezone(UTC).strftime(RUN_TIME_FORMAT),
        "package_version": version("hailprint"),
    }
