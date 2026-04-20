"""Utility helpers shared by the tool selection node."""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

from config.settings import LLMRole
from graph.mcp_prompt_context import build_mcp_prompts_context
from graph.state import RoomAgentGraphState
from langchain_core.tools import BaseTool


logger = logging.getLogger(__name__)


def get_model(role: LLMRole) -> Any:
    from app.server import get_llm_provider_registry

    model = get_llm_provider_registry().get(role)
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={role.value}")
    return model


def get_mcp_client() -> Any:
    from app.server import get_mcp_client

    return get_mcp_client()


async def describe_tools() -> list[dict[str, Any]]:
    client = get_mcp_client()
    if client is None:
        return []

    tools = await client.get_tools()
    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "args_schema": extract_tool_schema(tool),
        }
        for tool in tools
    ]


async def build_prompt_context() -> str:
    from app.server import get_settings

    client = get_mcp_client()
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


def render_tool_catalog(candidate_tools: list[dict[str, Any]]) -> str:
    """Render tools into a stable text block for token estimation and prompting."""
    return json.dumps(
        {"candidate_tools": candidate_tools},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def exclude_tools(
    candidate_tools: list[dict[str, Any]],
    excluded_tool_names: list[str],
) -> list[dict[str, Any]]:
    excluded_names = {
        normalize_tool_name(tool_name)
        for tool_name in excluded_tool_names
        if isinstance(tool_name, str) and tool_name.strip()
    }
    if not excluded_names:
        return list(candidate_tools)

    selected_tools = [
        tool
        for tool in candidate_tools
        if normalize_tool_name(str(tool.get("name", ""))) not in excluded_names
    ]
    logger.info("Excluded tools: %s", sorted(excluded_names))
    return selected_tools


def build_result(
    candidate_tools: list[dict[str, Any]],
    selected_tools: list[dict[str, Any]],
    comment: str,
    *,
    mode: str,
    rendered_tool_tokens: int,
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
            "mode": mode,
            "rendered_tool_tokens": rendered_tool_tokens,
        },
    }


def log_zero_tool_selection(prompt_input: str, comment: str) -> None:
    print(
        "[tool_selection] no tools selected "
        f"comment={comment} "
        f"user_input={prompt_input}",
        file=sys.stderr,
    )


def get_prompt_input(state: RoomAgentGraphState) -> str:
    return state.get("conversation_text", "").strip() or state.get("user_input", "").strip()


def normalize_tool_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def extract_tool_schema(tool: BaseTool) -> dict[str, Any]:
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
