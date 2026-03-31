"""Direct-response node for low-cost conversational replies."""

from __future__ import annotations

from config.settings import LLMRole
from graph.state import RoomAgentGraphState
from integrations.llm_provider import normalize_message_content
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from app.a2a_server import create_text_part, get_current_updater


async def direct_response(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Generate a minimal natural-language reply for non-tool requests."""
    model = _get_low_cost_model()
    prompt_input = _get_prompt_input(state)
    response = await model.ainvoke(_build_messages(prompt_input))
    reply = normalize_message_content(response).strip()
    if not reply:
        raise RuntimeError("Direct-response node received empty content from low-cost LLM.")

    try:
        updater = get_current_updater()
    except RuntimeError:
        updater = None

    if updater is not None:
        message = updater.new_agent_message(parts=[create_text_part(reply)])
        await updater.complete(message)

    return {
        "status": "completed",
        "next_action": "direct_response",
        "execution_result": {
            "type": "text",
            "message": reply.strip(),
            "intent": state.get("intent", {}),
        },
    }


def _get_low_cost_model():
    from app.server import get_llm_provider_registry

    model = get_llm_provider_registry().get(LLMRole.LOW_COST)
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.LOW_COST.value}")
    return model


def _build_messages(user_input: str) -> list[BaseMessage]:
    return [
        SystemMessage(
            content=(
                "你是 Room Agent 的直接回复节点。"
                "当前请求不需要工具调用。"
                "请直接给出一条简短、自然、礼貌的中文回复。"
                "不要编造工具执行，不要输出 JSON，不要输出多段长文。"
            )
        ),
        HumanMessage(content=user_input),
    ]


def _get_prompt_input(state: RoomAgentGraphState) -> str:
    return state.get("conversation_text", "").strip() or state.get("user_input", "").strip()
