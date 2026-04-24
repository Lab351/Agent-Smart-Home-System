"""Internal state definitions for the agent-execution subgraph."""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class FinalOutput(TypedDict, total=False):
    """Structured final output emitted by the agent loop."""

    message: str
    summary: str | None
    metadata: dict[str, Any] | None


class AgentExecutionState(TypedDict, total=False):
    """Encapsulated state for the agent-execution loop.

    Field groups:

    - request context: copied in from the outer graph so the subgraph can plan
      against the original user request and the tool-selection result
    - runtime loop state: mutated on each planner / tool-execution iteration
    - terminal state: written once the subgraph reaches final output or fails
    """

    # Original request context forwarded from the outer graph.
    user_input: str
    conversation_text: str
    subagent_system_prompt: str
    metadata: dict[str, Any]
    messages: Annotated[list[BaseMessage], add_messages]

    # Mutable loop state.
    step_count: int
    step_limit: int

    # Terminal / exit state.
    final_output: FinalOutput
    terminal_error: dict[str, Any]
    outer_state_patch: dict[str, Any]
