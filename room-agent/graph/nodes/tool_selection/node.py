"""Conservative tool-catalog gating for the Room Agent workflow."""

from __future__ import annotations

import json
import os
from typing import Any

from config.settings import LLMRole
from graph.nodes.tool_selection.token_estimator import estimate_text_tokens
from graph.nodes.tool_selection.utils import (
    build_prompt_context,
    build_result,
    describe_tools,
    exclude_tools,
    get_model,
    get_prompt_input,
    log_zero_tool_selection,
    render_tool_catalog,
)
from graph.nodes.utils.structured_output import invoke_structured_output
from graph.state import RoomAgentGraphState
from graph.utils.prompt_patch import maybe_apply_qwen_nothink
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage


TOOL_CATALOG_TOKEN_THRESHOLD = 14_000

ACTIVE_EXCLUSION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "excluded_tool_names": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "comment": {"type": "string"},
    },
    "required": ["excluded_tool_names", "comment"],
    "additionalProperties": False,
}


async def __abalation_test_tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Always pass through all tools."""
    candidate_tools = state.get("candidate_tools", [])
    comment = "Abalation test: passed through all candidate tools."
    return build_result(
        candidate_tools,
        candidate_tools,
        comment,
        mode="ablation_passthrough",
        rendered_tool_tokens=estimate_text_tokens(render_tool_catalog(candidate_tools)),
    )


async def tool_selection(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Pass through small tool catalogs and only exclude tools when the catalog is too long."""
    if os.getenv("__RA_ABALATION_TEST"):
        return await __abalation_test_tool_selection(state)

    prompt_input = get_prompt_input(state)
    candidate_tools = await describe_tools()

    if not candidate_tools:
        comment = "No MCP tools are available for this request."
        log_zero_tool_selection(prompt_input, comment)
        return build_result(
            candidate_tools,
            [],
            comment,
            mode="empty_catalog",
            rendered_tool_tokens=0,
        )

    rendered_catalog = render_tool_catalog(candidate_tools)
    rendered_tool_tokens = estimate_text_tokens(rendered_catalog)

    if rendered_tool_tokens <= TOOL_CATALOG_TOKEN_THRESHOLD:
        comment = (
            "Tool catalog is within the token budget; passed through all candidate tools "
            "without preselection."
        )
        return build_result(
            candidate_tools,
            list(candidate_tools),
            comment,
            mode="passthrough",
            rendered_tool_tokens=rendered_tool_tokens,
        )

    powerful_model = get_model(LLMRole.POWERFUL)
    mcp_prompt_context = await build_prompt_context()
    parsed = await invoke_structured_output(
        powerful_model,
        _build_active_exclusion_messages(
            prompt_input=prompt_input,
            candidate_tools=candidate_tools,
            mcp_prompt_context=mcp_prompt_context,
            rendered_tool_tokens=rendered_tool_tokens,
        ),
        schema=ACTIVE_EXCLUSION_OUTPUT_SCHEMA,
        temperature=0,
    )

    selected_tools = exclude_tools(
        candidate_tools,
        parsed.get("excluded_tool_names", []),
    )

    if not selected_tools:
        comment = (
            "Active exclusion removed every tool, so the node fell back to the full catalog "
            "to avoid over-pruning."
        )
        return build_result(
            candidate_tools,
            list(candidate_tools),
            comment,
            mode="active_exclusion_fallback",
            rendered_tool_tokens=rendered_tool_tokens,
        )

    comment = parsed.get("comment", "").strip() or "No active-exclusion comment provided."
    return build_result(
        candidate_tools,
        selected_tools,
        comment,
        mode="active_exclusion",
        rendered_tool_tokens=rendered_tool_tokens,
    )


def _build_active_exclusion_messages(
    *,
    prompt_input: str,
    candidate_tools: list[dict[str, Any]],
    mcp_prompt_context: str,
    rendered_tool_tokens: int,
) -> list[BaseMessage]:
    return [
        SystemMessage(
            content=(
                "你是 Room Agent 的工具目录裁剪节点。"
                "当前候选工具文本过长，容易伤害后续工具调用准确率。"
                "你的职责不是挑出少量“最优工具”，而是只排除那些对当前请求明显无关的工具。"
                "对有任何潜在相关性的工具都保留；宁可少排除，也不要过度裁剪。"
                "如果无法确定某个工具无关，就不要排除它。"
                "只输出 JSON，不要输出额外解释。"
            )
        ),
        HumanMessage(
            content=maybe_apply_qwen_nothink(
                json.dumps(
                    {
                        "task": (
                            "请基于用户输入和候选工具，排除明显无关的工具。"
                            "输出 JSON，字段为 excluded_tool_names(string[]) 和 comment(string)。"
                        ),
                        "user_input": prompt_input,
                        "mcp_prompts": mcp_prompt_context,
                        "rendered_tool_tokens": rendered_tool_tokens,
                        "token_threshold": TOOL_CATALOG_TOKEN_THRESHOLD,
                        "candidate_tools": candidate_tools,
                    },
                    ensure_ascii=False,
                )
            )
        ),
    ]
