"""Internal state definitions for the agent-execution subgraph."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict
from langchain_core.tools import BaseTool


class FinalOutput(TypedDict, total=False):
    """Structured final output emitted by the agent loop."""

    message: str
    summary: str | None
    metadata: dict[str, Any] | None


class PlannerStep(TypedDict, total=False):
    """Single planner step emitted by the agent loop."""

    step_type: Literal["reason", "toolcall", "final_output"]
    is_done: bool
    reason_summary: str
    tool_name: str
    tool_args: dict[str, Any]
    final_output: FinalOutput


class ToolResult(TypedDict, total=False):
    """Internal record of a single tool execution."""

    step_index: int
    tool_name: str
    tool_args: dict[str, Any]
    observation: Any
    error: str
    args_summary: str
    result_summary: str
    error_summary: str


class AgentExecutionState(TypedDict, total=False):
    """Encapsulated state for the agent-execution loop.

    Field groups:

    - request context: copied in from the outer graph so the subgraph can plan
      against the original user request and the intent/tool-selection result
    - runtime loop state: mutated on each planner / tool-execution iteration
    - terminal state: written once the subgraph reaches final output or fails
    """

    # Original request context forwarded from the outer graph.
    user_input: str
    conversation_text: str
    # Intent recognized by the outer graph; used as planner context only.
    intent: dict[str, Any]
    # Tools pre-filtered by the outer tool_selection node. The subgraph should
    # only plan against this subset instead of re-selecting from the full tool list.
    selected_tools: list[dict[str, Any]]
    metadata: dict[str, Any]
    # Tools actually exposed to the planner/executor inside the subgraph.
    available_tools: list[dict[str, Any]]
    available_tool_instances: dict[str, BaseTool]

    # Mutable loop state.
    step_count: int
    step_limit: int
    current_step: PlannerStep
    step_history: list[dict[str, Any]]
    raw_model_outputs: list[str]
    tool_results: list[ToolResult]

    # Terminal / exit state.
    final_output: FinalOutput
    replan_used: bool
    loop_decision: NotRequired[str]
    terminal_error: dict[str, Any]
    outer_state_patch: dict[str, Any]
