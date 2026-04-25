"""Internal state definitions for the Sasha verification subgraph."""

from __future__ import annotations

from typing import Any, TypedDict


class SashaVerificationState(TypedDict, total=False):
    """Encapsulated state for Sasha's first three reasoning steps."""

    user_input: str
    conversation_text: str
    metadata: dict[str, Any]
    static_context: str
    clarifying_text: str
    filtering_text: str
    filtered_context: str
    planning_text: str
    outer_state_patch: dict[str, Any]
