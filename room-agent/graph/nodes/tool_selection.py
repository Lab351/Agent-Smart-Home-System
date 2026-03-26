"""LLM-driven tool-selection node."""

from __future__ import annotations

import json
import sys
from typing import Any

from config.settings import LLMRole
from graph.state import RoomAgentGraphState
from llm_json_parse import JsonParserWithRepair
from tools.mcp_tools import MCPToolService


TOOL_SELECTION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "selected_tool_names": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
            "maxItems": 3,
        },
        "comment": {"type": "string"},
    },
    "required": ["selected_tool_names", "comment"],
    "additionalProperties": False,
}


async def tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Select up to three MCP tools for the current request."""
    provider = _get_low_cost_provider()
    tool_service = _get_tool_service()
    prompt_input = _get_prompt_input(state)
    candidate_tools = [tool.model_dump() for tool in await tool_service.describe_tools()]

    if not candidate_tools:
        comment = "No MCP tools are available for this request."
        _log_zero_tool_selection(prompt_input, state.get("intent", {}), comment)
        return _build_result(candidate_tools, [], comment)

    raw_output = await provider.complete_text(
        _build_messages(
            prompt_input=prompt_input,
            intent=state.get("intent", {}),
            candidate_tools=candidate_tools,
        ),
        temperature=0,
        json_mode=True,
    )
    parsed = await JsonParserWithRepair(llm_provider=provider)(
        raw_output,
        schema=TOOL_SELECTION_OUTPUT_SCHEMA,
    )

    selected_tools = _select_tools(
        candidate_tools,
        parsed.get("selected_tool_names", []),
    )
    comment = parsed.get("comment", "").strip() or "No tool-selection comment provided."

    if not selected_tools:
        _log_zero_tool_selection(prompt_input, state.get("intent", {}), comment)

    return _build_result(candidate_tools, selected_tools, comment)


def _get_low_cost_provider() -> Any:
    from app.server import get_llm_provider_registry

    provider = get_llm_provider_registry().get(LLMRole.LOW_COST)
    if provider is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.LOW_COST.value}")
    return provider


def _get_tool_service() -> MCPToolService:
    from app.server import get_mcp_client

    return MCPToolService(get_mcp_client())


def _build_messages(
    *,
    prompt_input: str,
    intent: dict[str, Any],
    candidate_tools: list[dict[str, Any]],
) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 Room Agent 的工具选择节点。"
                "你的职责只有一个：从候选 MCP 工具中挑选最适合当前请求的 0 到 3 个工具。"
                "如果没有任何合适工具，返回空数组。"
                "只输出 JSON，不要输出额外解释。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "task": (
                        "请基于用户输入、已识别意图和候选工具，选择最合适的 0 到 3 个工具。"
                        "输出 JSON，字段为 selected_tool_names(string[]) 和 comment(string)。"
                    ),
                    "user_input": prompt_input,
                    "intent": intent,
                    "candidate_tools": candidate_tools,
                },
                ensure_ascii=False,
            ),
        },
    ]


def _select_tools(
    candidate_tools: list[dict[str, Any]],
    selected_tool_names: list[str],
) -> list[dict[str, Any]]:
    tool_by_name = {tool["name"]: tool for tool in candidate_tools}
    selected_tools: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for tool_name in selected_tool_names:
        if tool_name in seen_names:
            continue
        tool = tool_by_name.get(tool_name)
        if tool is None:
            continue
        selected_tools.append(tool)
        seen_names.add(tool_name)
        if len(selected_tools) == 3:
            break

    return selected_tools


def _build_result(
    candidate_tools: list[dict[str, Any]],
    selected_tools: list[dict[str, Any]],
    comment: str,
) -> RoomAgentGraphState:
    return {
        "status": "completed",
        "next_action": "tool_selection",
        "candidate_tools": candidate_tools,
        "selected_tools": selected_tools,
        "execution_result": {
            "type": "tool_selection",
            "comment": comment,
            "selected_count": len(selected_tools),
        },
    }


def _log_zero_tool_selection(
    prompt_input: str,
    intent: dict[str, Any],
    comment: str,
) -> None:
    print(
        "[tool_selection] no tools selected "
        f"intent={json.dumps(intent, ensure_ascii=False)} "
        f"comment={comment} "
        f"user_input={prompt_input}",
        file=sys.stderr,
    )


def _get_prompt_input(state: RoomAgentGraphState) -> str:
    return state.get("conversation_text", "").strip() or state.get("user_input", "").strip()
