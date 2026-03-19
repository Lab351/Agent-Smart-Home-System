"""State definitions for the Room Agent LangGraph workflow."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict


class IntentResult(TypedDict, total=False):
    """Structured intent classification result."""

    name: str
    confidence: float


class ExecutionError(TypedDict, total=False):
    """Structured execution error payload."""

    type: str
    message: str
    source_node: str
    retryable: bool


class RoomAgentGraphState(TypedDict, total=False):
    """Shared graph state for the next-generation Room Agent workflow."""

    user_input: str
    intent: IntentResult
    need_tool_call: bool
    candidate_tools: list[dict[str, Any]]
    selected_tools: list[dict[str, Any]]
    plan: dict[str, Any]
    human_review: dict[str, Any]
    execution_args: dict[str, Any]
    execution_result: dict[str, Any]
    error: ExecutionError
    metadata: dict[str, Any]
    artifacts: dict[str, Any]
    status: Literal["initialized", "completed", "failed"]
    next_action: NotRequired[str]
