"""Direct-response node for low-cost conversational replies."""

from __future__ import annotations

from config.settings import LLMRole
from graph.state import RoomAgentGraphState


async def direct_response(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Generate a minimal natural-language reply for non-tool requests."""
    provider = _get_low_cost_provider()
    user_input = state.get("user_input", "").strip()
    reply = await provider.complete_text(_build_messages(user_input), json_mode=False)

    return {
        "status": "completed",
        "next_action": "direct_response",
        "execution_result": {
            "type": "text",
            "message": reply.strip(),
            "intent": state.get("intent", {}),
        },
    }


def _get_low_cost_provider():
    from app.server import get_llm_provider_registry

    provider = get_llm_provider_registry().get(LLMRole.LOW_COST)
    if provider is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.LOW_COST.value}")
    return provider


def _build_messages(user_input: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 Room Agent 的直接回复节点。"
                "当前请求不需要工具调用。"
                "请直接给出一条简短、自然、礼貌的中文回复。"
                "不要编造工具执行，不要输出 JSON，不要输出多段长文。"
            ),
        },
        {
            "role": "user",
            "content": user_input,
        },
    ]
