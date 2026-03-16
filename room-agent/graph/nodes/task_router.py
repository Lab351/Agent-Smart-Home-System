"""Routing helpers for the rebuilt LangGraph runtime."""

from __future__ import annotations

from typing import Literal

from graph.state import GraphState


RouteName = Literal["simple_chat", "mcp", "device", "error"]


def route_after_classification(state: GraphState) -> RouteName:
    if state.get("error"):
        return "error"

    intent = state.get("intent", {})
    if intent.get("type") == "simple_chat":
        return "simple_chat"

    executor_type = intent.get("executor_type")
    if executor_type == "device":
        return "device"
    if executor_type == "mcp":
        return "mcp"
    return "error"
