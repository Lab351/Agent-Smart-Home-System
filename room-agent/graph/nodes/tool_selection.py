"""Placeholder tool-selection node."""

from __future__ import annotations

from graph.state import RoomAgentGraphState


async def tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Placeholder node for the tool path."""
    return {
        "status": "completed",
        "next_action": "tool_selection",
        "candidate_tools": state.get("candidate_tools", []),
        "selected_tools": state.get("selected_tools", []),
        "execution_result": {
            "type": "placeholder",
            "message": "tool_selection node is not implemented yet",
            "intent": state.get("intent", {}),
        },
    }
