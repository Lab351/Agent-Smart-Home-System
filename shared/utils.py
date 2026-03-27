"""Shared utility helpers."""

from datetime import UTC, datetime


def utc_now_iso() -> str:
    """Return an ISO 8601 UTC timestamp with trailing Z."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def utc_now() -> datetime:
    """Return a timezone-aware UTC datetime."""
    return datetime.now(UTC)
