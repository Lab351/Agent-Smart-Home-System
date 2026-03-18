"""Intent recognition node for the Room Agent graph."""

from __future__ import annotations

from typing import Any

from config.settings import LLMRole
from graph.state import RoomAgentGraphState
from shared.llm import parse_json_with_repair


INTENT_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent_name": {"type": "string", "minLength": 1},
        "need_tool_call": {"type": "boolean"},
    },
    "required": ["intent_name", "need_tool_call"],
    "additionalProperties": False,
}


async def intent_recognition(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Classify whether the request needs tool execution."""
    provider = _get_low_cost_provider()
    user_input = state.get("user_input", "").strip()

    raw_output = await provider.complete_text(
        _build_messages(user_input),
        json_mode=True,
    )
    parsed = await parse_json_with_repair(
        raw_output,
        llm_provider=provider,
        schema=INTENT_OUTPUT_SCHEMA,
    )

    return {
        "intent": {
            "name": parsed["intent_name"],
        },
        "need_tool_call": parsed["need_tool_call"],
        "next_action": "tool_selection" if parsed["need_tool_call"] else "direct_response",
    }


def route_after_intent(state: RoomAgentGraphState) -> str:
    """Route to the next node after intent recognition."""
    return "tool_selection" if state.get("need_tool_call") else "direct_response"


def _get_low_cost_provider() -> Any:
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
                "你是 Room Agent 的意图分析节点。"
                "你的任务只有一个：判断当前用户请求是否需要后续工具调用或执行能力。"
                "如果只是闲聊、问候、纯解释、普通文本问答，则 need_tool_call=false。"
                "如果请求需要外部工具、设备控制、查询系统或后续执行流程，则 need_tool_call=true。"
                "请仅输出 JSON，不要输出额外解释。"
            ),
        },
        {
            "role": "user",
            "content": (
                "请分析下面的用户输入，并输出 JSON。\n"
                "字段要求：intent_name(string), need_tool_call(boolean).\n"
                "下面是示例：\n"
                "示例1\n"
                "输入：你好\n"
                "输出：{\"intent_name\":\"chat\",\"need_tool_call\":false}\n"
                "示例2\n"
                "输入：你是谁\n"
                "输出：{\"intent_name\":\"chat\",\"need_tool_call\":false}\n"
                "示例3\n"
                "输入：帮我打开卧室的灯\n"
                "输出：{\"intent_name\":\"device_control\",\"need_tool_call\":true}\n"
                "示例4\n"
                "输入：查一下今天上海天气\n"
                "输出：{\"intent_name\":\"information_query\",\"need_tool_call\":true}\n"
                "示例5\n"
                "输入：解释一下为什么晚上开空调会口干\n"
                "输出：{\"intent_name\":\"explanation\",\"need_tool_call\":false}\n"
                "现在请只针对下面这个输入输出 JSON，不要附加解释。\n"
                f"用户输入：{user_input}"
            ),
        },
    ]
