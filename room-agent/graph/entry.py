"""Minimal LangGraph entrypoint for the Room Agent workflow."""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from .nodes.tool_selection import tool_selection
from .state import RoomAgentGraphState
from .subgraphs.agent_execution import agent_execution


def initialize_request(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Normalize the incoming request into the shared state schema."""
    user_input = state.get("user_input", "").strip()
    conversation_text = state.get("conversation_text", "").strip() or user_input
    metadata = dict(state.get("metadata", {}))
    metadata.setdefault("graph_version", "v1")

    return {
        "user_input": user_input,
        "conversation_text": conversation_text,
        "candidate_tools": state.get("candidate_tools", []),
        "selected_tools": state.get("selected_tools", []),
        "tool_call_history": state.get("tool_call_history", []),
        "metadata": metadata,
        "status": "initialized",
    }


def build_graph() -> StateGraph:
    """Build the Room Agent graph skeleton."""
    graph = StateGraph(RoomAgentGraphState)

    graph.add_node("initialize_request", initialize_request)
    graph.add_node("agent_execution", agent_execution)
    graph.add_node("tool_selection", tool_selection)

    # Edges.
    graph.add_edge(START, "initialize_request")
    graph.add_edge("initialize_request", "tool_selection")
    graph.add_edge("tool_selection", "agent_execution")
    graph.add_edge("agent_execution", END)
    
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
