"""Minimal LangGraph entrypoint for the Room Agent workflow."""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

if __package__ in {None, ""}:
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parent))
    from state import RoomAgentGraphState
else:
    from .state import RoomAgentGraphState


def initialize_request(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Normalize the incoming request into the shared state schema."""
    user_input = state.get("user_input", "").strip()
    metadata = dict(state.get("metadata", {}))
    metadata.setdefault("graph_version", "v1")

    return {
        "user_input": user_input,
        "candidate_tools": state.get("candidate_tools", []),
        "selected_tools": state.get("selected_tools", []),
        "artifacts": state.get("artifacts", {}),
        "metadata": metadata,
        "status": "initialized",
    }


def build_graph() -> StateGraph:
    """Build the Room Agent graph skeleton.

    This is the formal entrypoint for the upcoming LangGraph rewrite.
    It intentionally contains only the minimal initialization node for now.
    """
    graph = StateGraph(RoomAgentGraphState)
    graph.add_node("initialize_request", initialize_request)
    graph.add_edge(START, "initialize_request")
    graph.add_edge("initialize_request", END)
    return graph


def compile_graph(*, checkpointer: Any | None = None) -> Any:
    """Compile the Room Agent graph with an optional checkpointer."""
    graph = build_graph()
    return graph.compile(checkpointer=checkpointer)


def main() -> None:
    """Simple local entrypoint for manual graph invocation."""
    app = compile_graph()
    result = app.invoke({"user_input": ""})
    print(result)


if __name__ == "__main__":
    main()
