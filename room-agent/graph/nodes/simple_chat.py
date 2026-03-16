"""Simple chat node for the rebuilt LangGraph runtime."""

from __future__ import annotations

from datetime import UTC, datetime

from graph.state import GraphState
from integrations.llm_provider import ChatProvider


class SimpleChatNode:
    def __init__(self, llm_provider: ChatProvider | None) -> None:
        self.llm_provider = llm_provider

    async def __call__(self, state: GraphState) -> GraphState:
        response = state.get("response")
        if not response and self.llm_provider is not None:
            try:
                response = await self.llm_provider.complete_text(
                    [
                        {
                            "role": "system",
                            "content": "你是 room-agent。请用简短、自然的中文回复用户。",
                        },
                        {"role": "user", "content": state["input"]},
                    ],
                    temperature=0.3,
                )
            except Exception:
                response = None

        response = response or "你好，我在。"
        return {
            "response": response,
            "trace": [
                {
                    "node": "simple_chat",
                    "event": "responded",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            ],
        }
