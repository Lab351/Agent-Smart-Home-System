"""LLM-driven tool-selection node."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from config.settings import LLMRole
from graph.mcp_prompt_context import build_mcp_prompts_context
from graph.nodes.utils.structured_output import invoke_structured_output
from graph.state import RoomAgentGraphState
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
import logging

logger = logging.getLogger(__name__)

TOOL_SELECTION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "selected_tool_names": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "comment": {"type": "string"},
    },
    "required": ["selected_tool_names", "comment"],
    "additionalProperties": False,
}


async def __abalation_test_tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Always select all tools"""
    candidate_tools = state.get("candidate_tools", [])
    selected_tools = candidate_tools
    comment = "Abalation test: selected all candidate tools."
    return _build_result(candidate_tools, selected_tools, comment)


async def tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Select up to three MCP tools for the current request."""
    if os.getenv("__RA_ABALATION_TEST"):
        return await __abalation_test_tool_selection(state)

    model = _get_low_cost_model()
    prompt_input = _get_prompt_input(state)
    candidate_tools = await _describe_tools()
    mcp_prompt_context = await _build_mcp_prompt_context()

    if not candidate_tools:
        comment = "No MCP tools are available for this request."
        _log_zero_tool_selection(prompt_input, state.get("intent", {}), comment)
        return _build_result(candidate_tools, [], comment)

    parsed = await invoke_structured_output(
        model,
        _build_messages(
            prompt_input=prompt_input,
            intent=state.get("intent", {}),
            candidate_tools=candidate_tools,
            mcp_prompt_context=mcp_prompt_context,
        ),
        schema=TOOL_SELECTION_OUTPUT_SCHEMA,
        temperature=0,
    )

    selected_tools = _select_tools(
        candidate_tools,
        parsed.get("selected_tool_names", []),
    )
    comment = parsed.get("comment", "").strip() or "No tool-selection comment provided."

    if not selected_tools:
        _log_zero_tool_selection(prompt_input, state.get("intent", {}), comment)

    return _build_result(candidate_tools, selected_tools, comment)


def _get_low_cost_model() -> Any:
    from app.server import get_llm_provider_registry

    model = get_llm_provider_registry().get(LLMRole.LOW_COST)
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.LOW_COST.value}")
    return model


def _get_mcp_client():
    from app.server import get_mcp_client

    return get_mcp_client()


async def _describe_tools() -> list[dict[str, Any]]:
    client = _get_mcp_client()
    if client is None:
        return []

    tools = await client.get_tools()
    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "args_schema": _extract_tool_schema(tool),
        }
        for tool in tools
    ]


async def _build_mcp_prompt_context() -> str:
    from app.server import get_settings

    client = _get_mcp_client()
    if client is None:
        return ""

    server_name: str | None = None
    try:
        settings = get_settings()
    except Exception as exc:
        logger.info("Failed to load settings for MCP prompt context: %s", exc)
    else:
        agent_settings = getattr(settings, "agent", None)
        mcp_settings = getattr(agent_settings, "home_assistant_mcp", None)
        server_name = getattr(mcp_settings, "server_name", None)

    return await build_mcp_prompts_context(
        client=client,
        server_name=server_name,
    )


def _build_messages(
    *,
    prompt_input: str,
    intent: Any,
    candidate_tools: list[dict[str, Any]],
    mcp_prompt_context: str,
) -> list[BaseMessage]:
    return [
        SystemMessage(
            content=(
                "你是 Room Agent 的工具选择节点。"
                "你的职责只有一个：从候选 MCP 工具中挑选最适合当前请求的 0 到 3 个工具。如果用户提到了多个意图，你可以选择多个。按执行顺序或者相关程度排序。"
                "如果没有任何合适工具，返回空数组。"
                "优先参考 MCP Prompts 中的模板语义，避免误选工具。"
                "只输出 JSON，不要输出额外解释。"
            )
        ),
        HumanMessage(
            content=json.dumps(
                {
                    "task": (
                        "请基于用户输入、已识别意图和候选工具，选择最合适的 0 到 3 个工具。"
                        "输出 JSON，字段为 selected_tool_names(string[]) 和 comment(string)。"
                    ),
                    "user_input": prompt_input,
                    "intent": intent,
                    "mcp_prompts": mcp_prompt_context,
                    "candidate_tools": candidate_tools,
                },
                ensure_ascii=False,
            )
        ),
    ]


def _normalize_tool_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def _select_tools(
    candidate_tools: list[dict[str, Any]],
    selected_tool_names: list[str],
) -> list[dict[str, Any]]:
    tool_by_name = {_normalize_tool_name(tool["name"]): tool for tool in candidate_tools}
    selected_tools: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for tool_name in selected_tool_names:
        _normalized_selected_name = _normalize_tool_name(tool_name)

        if _normalized_selected_name in seen_names:
            continue
        tool = tool_by_name.get(_normalized_selected_name)
        if tool is None:
            continue
        selected_tools.append(tool)
        seen_names.add(_normalized_selected_name)

    logger.info(
        "Selected tools: %s",
        [tool["name"] for tool in selected_tools],
    )
    # 提示词防止模型发狂, 实际上我们不写死上限
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
    intent: Any,
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


def _extract_tool_schema(tool: BaseTool) -> dict[str, Any]:
    get_input_schema = getattr(tool, "get_input_schema", None)
    if callable(get_input_schema):
        schema_model = get_input_schema()
        model_json_schema = getattr(schema_model, "model_json_schema", None)
        if callable(model_json_schema):
            schema = model_json_schema()
            return schema if isinstance(schema, dict) else {}

    args_schema = getattr(tool, "args", {}) or {}
    if args_schema:
        return {
            "type": "object",
            "properties": args_schema,
        }

    return {}
