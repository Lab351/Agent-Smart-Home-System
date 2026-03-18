"""Placeholder direct-response node."""

from __future__ import annotations

from graph.state import RoomAgentGraphState


async def direct_response(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Placeholder node for the non-tool path."""
    return {
        "status": "completed",
        "next_action": "direct_response",
        "execution_result": {
            "type": "placeholder",
            "message": "direct_response node is not implemented yet",
            "intent": state.get("intent", {}),
        },
    }
