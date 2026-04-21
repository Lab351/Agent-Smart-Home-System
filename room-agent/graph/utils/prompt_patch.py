"""Prompt patch helpers used to apply model-specific input suffixes safely."""

from __future__ import annotations

import os


QWEN_NOTHINK_ENV = "__RA_QWEN_NOTHINK"
QWEN_NOTHINK_SUFFIX = "/nothink"
_TRUTHY_VALUES = {"1", "true", "yes", "on"}


def maybe_apply_qwen_nothink(text: str) -> str:
    """Append '/nothink' only when the dedicated qwen toggle is enabled."""
    normalized = text.strip()
    if not normalized:
        return normalized
    if not _is_qwen_nothink_enabled():
        return normalized
    if normalized.endswith(QWEN_NOTHINK_SUFFIX):
        return normalized
    return f"{normalized}{QWEN_NOTHINK_SUFFIX}"


def _is_qwen_nothink_enabled() -> bool:
    value = os.getenv(QWEN_NOTHINK_ENV, "").strip().lower()
    return value in _TRUTHY_VALUES