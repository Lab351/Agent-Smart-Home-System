"""State definitions for the Room Agent LangGraph workflow."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict


class ExecutionError(TypedDict, total=False):
    """Structured execution error payload."""

    type: str
    message: str
    source_node: str
    retryable: bool


class RoomAgentGraphState(TypedDict, total=False):
    """Shared graph state for the next-generation Room Agent workflow."""

    user_input: str
    conversation_text: str
    subagent_system_prompt: str
    candidate_tools: list[dict[str, Any]]
    selected_tools: list[dict[str, Any]]
    tool_call_history: list[dict[str, Any]]
    execution_result: dict[str, Any]
    error: ExecutionError
    metadata: dict[str, Any]
    status: Literal["initialized", "completed", "failed"]
    next_action: NotRequired[str]
