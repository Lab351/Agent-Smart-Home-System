"""Graph state definitions for the rebuilt room-agent runtime."""

from __future__ import annotations

from datetime import UTC, datetime
from operator import add
from typing import Annotated, Any, TypedDict
from uuid import uuid4


class GraphState(TypedDict, total=False):
    run_id: str
    request_id: str
    session_id: str
    input: str
    intent: dict[str, Any]
    task: dict[str, Any]
    mcp: dict[str, Any]
    response: str
    result: dict[str, Any]
    error: dict[str, Any] | None
    trace: Annotated[list[dict[str, Any]], add]


def create_initial_state(
    user_input: str,
    session_id: str | None = None,
    request_id: str | None = None,
) -> GraphState:
    run_id = str(uuid4())
    return GraphState(
        run_id=run_id,
        request_id=request_id or run_id,
        session_id=session_id or "local-session",
        input=user_input,
        trace=[
            {
                "node": "bootstrap",
                "event": "graph_initialized",
                "timestamp": datetime.now(UTC).isoformat(),
            }
        ],
    )
