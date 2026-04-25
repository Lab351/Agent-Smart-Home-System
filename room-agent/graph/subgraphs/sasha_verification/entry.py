"""Sasha verification subgraph for the first three reasoning steps."""

from __future__ import annotations

import os
from typing import Any

from app.server import get_llm_provider_registry, get_mcp_client, get_settings
from config.settings import LLMRole
from graph.mcp_prompt_context import build_mcp_prompts_context
from graph.state import RoomAgentGraphState
from integrations.llm_provider import normalize_message_content
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from .state import SashaVerificationState


SASHA_VER_ENV = "__RA_SASHA_VER"
_TRUTHY_VALUES = {"1", "true", "yes", "on"}


async def sasha_verification(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Optionally run Sasha's first three reasoning steps and patch conversation_text."""
    if not _is_sasha_verification_enabled():
        return {}

    result = await compile_sasha_verification_subgraph().ainvoke(
        {
            "user_input": state.get("user_input", ""),
            "conversation_text": state.get("conversation_text", ""),
            "metadata": dict(state.get("metadata", {})),
        }
    )
    return result.get("outer_state_patch", {})


def compile_sasha_verification_subgraph() -> Any:
    """Compile the Sasha verification subgraph."""
    graph = StateGraph(SashaVerificationState)
    graph.add_node("subgraph_input_transform", subgraph_input_transform)
    graph.add_node("clarifying", clarifying)
    graph.add_node("filtering", filtering)
    graph.add_node("planning", planning)
    graph.add_node("subgraph_output_transform", subgraph_output_transform)

    graph.add_edge(START, "subgraph_input_transform")
    graph.add_edge("subgraph_input_transform", "clarifying")
    graph.add_edge("clarifying", "filtering")
    graph.add_edge("filtering", "planning")
    graph.add_edge("planning", "subgraph_output_transform")
    graph.add_edge("subgraph_output_transform", END)
    return graph.compile()


async def subgraph_input_transform(state: SashaVerificationState) -> SashaVerificationState:
    """Initialize Sasha verification input state."""
    user_input = state.get("user_input", "").strip()
    conversation_text = state.get("conversation_text", "").strip() or user_input
    return {
        "user_input": user_input,
        "conversation_text": conversation_text,
        "metadata": dict(state.get("metadata", {})),
        "static_context": await _build_static_context(),
    }


async def clarifying(state: SashaVerificationState) -> SashaVerificationState:
    """Clarify whether the user's goal is achievable with available devices."""
    messages = [
        SystemMessage(content=_build_clarifying_system_prompt(state.get("static_context", ""))),
        HumanMessage(
            content=_build_current_question_prompt(
                conversation_text=state.get("conversation_text", ""),
                user_input=state.get("user_input", ""),
            )
        ),
    ]
    return {"clarifying_text": await _invoke_text_model(messages, source_node="clarifying")}


async def filtering(state: SashaVerificationState) -> SashaVerificationState:
    """Filter the minimal relevant device set in natural language."""
    messages = [
        SystemMessage(content=_build_filtering_system_prompt(state.get("static_context", ""))),
        HumanMessage(content="Which are the relevant devices?"),
        AIMessage(content=state.get("clarifying_text", "")),
        HumanMessage(
            content=_build_current_question_prompt(
                conversation_text=state.get("conversation_text", ""),
                user_input=state.get("user_input", ""),
            )
        ),
    ]
    filtering_text = await _invoke_text_model(messages, source_node="filtering")
    return {
        "filtering_text": filtering_text,
        "filtered_context": _build_filtered_context(
            static_context=state.get("static_context", ""),
            filtering_text=filtering_text,
        ),
    }


async def planning(state: SashaVerificationState) -> SashaVerificationState:
    """Produce a natural-language action-plan summary from filtered devices."""
    messages = [
        SystemMessage(content=_build_planning_system_prompt(state.get("static_context", ""))),
        HumanMessage(content="How are these devices used to meet the goal?"),
        AIMessage(content=state.get("filtered_context", "")),
        HumanMessage(
            content=_build_current_question_prompt(
                conversation_text=state.get("conversation_text", ""),
                user_input=state.get("user_input", ""),
            )
        ),
    ]
    return {"planning_text": await _invoke_text_model(messages, source_node="planning")}


def subgraph_output_transform(state: SashaVerificationState) -> SashaVerificationState:
    """Map Sasha verification output back to the outer graph contract."""
    user_input = state.get("user_input", "").strip()
    conversation_text = state.get("conversation_text", "").strip() or user_input
    filtered_context = state.get("filtered_context", "").strip()
    aggregated_text = "\n\n".join(
        [
            f"Original conversation text:\n{conversation_text}",
            f"Clarifying result:\n{state.get('clarifying_text', '').strip()}",
            f"Filtering result:\n{state.get('filtering_text', '').strip()}",
            f"Planning result:\n{state.get('planning_text', '').strip()}",
            f"Current user question:\n{user_input}",
            f"Repeated question:\n{user_input}",
        ]
    ).strip()
    return {
        "outer_state_patch": {
            "conversation_text": aggregated_text,
            "subagent_system_prompt": _build_execution_system_prompt(filtered_context),
        }
    }


def _is_sasha_verification_enabled() -> bool:
    value = os.getenv(SASHA_VER_ENV, "").strip().lower()
    return value in _TRUTHY_VALUES


async def _build_static_context() -> str:
    client = get_mcp_client()
    if client is None:
        return ""

    server_name: str | None = None
    try:
        settings = get_settings()
    except Exception:
        settings = None

    if settings is not None:
        agent_settings = getattr(settings, "agent", None)
        mcp_settings = getattr(agent_settings, "home_assistant_mcp", None)
        server_name = getattr(mcp_settings, "server_name", None)

    return await build_mcp_prompts_context(client=client, server_name=server_name)


def _build_clarifying_system_prompt(static_context: str) -> str:
    return (
        "Clarifying task: consider the goal of the user's command in relation to the devices "
        "available in the home template. Decide whether the goal is achievable with the devices "
        "available, and return a concise natural-language result. Do not output JSON."
        f"\n\nVendor static context:\n{_render_static_context(static_context)}"
    )


def _build_filtering_system_prompt(static_context: str) -> str:
    return (
        "Filtering task: select the minimal set of relevant devices from the home template. "
        "Return only a concise natural-language filtering result. Do not output JSON. "
        "The previous assistant message is your compressed reasoning result."
        f"\n\nVendor static context:\n{_render_static_context(static_context)}"
    )


def _build_planning_system_prompt(static_context: str) -> str:
    return (
        "Planning task: produce an action plan from the filtered devices to meet the user's goal. "
        "Return only a concise natural-language planning result. Do not output JSON. "
        "The previous assistant message is your compressed reasoning result."
        f"\n\nVendor static context:\n{_render_static_context(static_context)}"
    )


def _build_filtered_context(*, static_context: str, filtering_text: str) -> str:
    return (
        "Filtered context:\n"
        f"{filtering_text.strip()}\n\n"
        "Vendor static context:\n"
        f"{_render_static_context(static_context)}"
    ).strip()


def _build_execution_system_prompt(filtered_context: str) -> str:
    normalized_context = filtered_context.strip() or "Filtered context:\n(none)"
    return (
        "你是智能家居执行助手。按给定计划执行，优先调用工具完成查询或控制。\n"
        "规则：\n"
        "1. 只依据已给出的筛选上下文和计划执行，不重新发散推理。\n"
        "2. 传入 Home Assistant 工具的设备名和区域名必须来自已给出的上下文。\n"
        "3. 不要编造工具结果、设备状态或执行记录。\n"
        "4. 工具失败时可重试 1 - 2 次；仍失败时明确说明限制。\n"
        "5. 最后给出简洁的用户可见回复。\n\n"
        f"{normalized_context}"
    )


def _build_current_question_prompt(*, conversation_text: str, user_input: str) -> str:
    normalized_conversation = conversation_text.strip() or user_input.strip()
    normalized_user_input = user_input.strip() or normalized_conversation
    return (
        "Question input:\n"
        f"{normalized_conversation}\n\n"
        "Repeated question:\n"
        f"{normalized_user_input}"
    ).strip()


def _render_static_context(static_context: str) -> str:
    normalized = static_context.strip()
    return normalized if normalized else "(none)"


async def _invoke_text_model(messages: list[BaseMessage], *, source_node: str) -> str:
    model = get_llm_provider_registry().get(LLMRole.POWERFUL)
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.POWERFUL.value}")

    response = await model.bind(temperature=0).ainvoke(messages)
    text = normalize_message_content(response).strip()
    if not text:
        raise RuntimeError(f"{source_node} returned empty content.")
    return text
