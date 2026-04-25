"""Agent-execution subgraph implemented with LangGraph's message-native tool loop."""

from __future__ import annotations

import json
import inspect
import logging
from functools import partial
from typing import Any, cast

from a2a.types import TaskState
from app.a2a_server import create_text_part, get_current_updater
from app.server import get_settings, get_llm_provider_registry, get_mcp_client
from config.settings import LLMRole
from graph.mcp_prompt_context import build_mcp_prompts_context
from graph.state import RoomAgentGraphState
from integrations.llm_provider import normalize_message_content
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command

from .state import AgentExecutionState


logger = logging.getLogger(__name__)
DEFAULT_STEP_LIMIT = 6
USER_VISIBLE_UNFINISHED_MESSAGE = "任务暂时无法完成，请稍后重试。"


async def agent_execution(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Run the message-native tool loop and map the result back to outer graph state."""
    available_tools, tool_instances = await _load_selected_tools(state.get("selected_tools", []))
    result = await compile_agent_execution_subgraph(
        selected_tools=available_tools,
        tool_instances=list(tool_instances.values()),
    ).ainvoke(
        {
            "user_input": state.get("user_input", ""),
            "conversation_text": state.get("conversation_text", ""),
            "subagent_system_prompt": state.get("subagent_system_prompt", ""),
            "metadata": dict(state.get("metadata", {})),
        }
    )
    return result.get("outer_state_patch", {})


def compile_agent_execution_subgraph(
    *,
    selected_tools: list[dict[str, Any]] | None = None,
    tool_instances: list[BaseTool] | None = None,
) -> Any:
    """Compile the internal agent-execution subgraph for the selected tools."""
    runtime_tool_descriptors = list(selected_tools or [])
    runtime_tool_instances = list(tool_instances or [])

    graph = StateGraph(AgentExecutionState)
    graph.add_node(
        "subgraph_input_transform",
        partial(subgraph_input_transform, selected_tools=runtime_tool_descriptors),
    )
    graph.add_node(
        "agent_call_model",
        partial(agent_call_model, tool_instances=runtime_tool_instances),
    )
    graph.add_node(
        "tools",
        ToolNode(
            runtime_tool_instances,
            messages_key="messages",
            awrap_tool_call=_awrap_tool_call,
        ),
    )
    graph.add_node("agent_finalize_output", agent_finalize_output)
    graph.add_node("agent_submit_reply", agent_submit_reply)
    graph.add_node("subgraph_output_transform", subgraph_output_transform)

    graph.add_edge(START, "subgraph_input_transform")
    graph.add_edge("subgraph_input_transform", "agent_call_model")
    graph.add_conditional_edges(
        "agent_call_model",
        route_after_model_call,
        {
            "tools": "tools",
            "finalize": "agent_finalize_output",
            "handle_error": "agent_submit_reply",
        },
    )
    graph.add_edge("tools", "agent_call_model")
    graph.add_edge("agent_finalize_output", "agent_submit_reply")
    graph.add_edge("agent_submit_reply", "subgraph_output_transform")
    graph.add_edge("subgraph_output_transform", END)
    return graph.compile()


async def subgraph_input_transform(
    state: AgentExecutionState,
    *,
    selected_tools: list[dict[str, Any]],
) -> AgentExecutionState:
    """Initialize the message state for the tool-calling loop."""
    user_input = state.get("user_input", "").strip()
    prompt_input = state.get("conversation_text", "").strip() or user_input
    conversation_text = prompt_input
    system_prompt = state.get("subagent_system_prompt", "").strip() or await _build_system_prompt(
        selected_tools=selected_tools,
    )

    return {
        "user_input": user_input,
        "conversation_text": conversation_text,
        "subagent_system_prompt": system_prompt,
        "metadata": dict(state.get("metadata", {})),
        "messages": [
            SystemMessage(content=system_prompt),
            HumanMessage(content=conversation_text),
        ],
        "step_count": 0,
        "step_limit": DEFAULT_STEP_LIMIT,
    }


async def agent_call_model(
    state: AgentExecutionState,
    *,
    tool_instances: list[BaseTool],
) -> AgentExecutionState:
    """Call the powerful model with bound tools and append its AIMessage."""
    if state.get("terminal_error"):
        return {}

    if state.get("step_count", 0) >= state.get("step_limit", DEFAULT_STEP_LIMIT):
        return {
            "terminal_error": {
                "type": "agent_step_limit_exceeded",
                "message": (
                    "Agent step limit exceeded before completion "
                    f"(limit={state.get('step_limit', DEFAULT_STEP_LIMIT)})."
                ),
                "source_node": "agent_call_model",
                "retryable": False,
            }
        }

    model = _get_powerful_model()
    runnable = (
        model.bind_tools(tool_instances, temperature=0)
        if tool_instances
        else model.bind(temperature=0)
    )
    response = await runnable.ainvoke(state.get("messages", []))
    if response.tool_calls:
        await _send_model_status_update(response)
    return {
        "messages": [response],
        "step_count": state.get("step_count", 0) + 1,
    }


def route_after_model_call(state: AgentExecutionState) -> str:
    """Route based on the model output and terminal state."""
    if state.get("terminal_error"):
        return "handle_error"
    if tools_condition(cast(dict[str, Any], state), messages_key="messages") == "tools":
        return "tools"
    return "finalize"


def agent_finalize_output(state: AgentExecutionState) -> AgentExecutionState:
    """Convert the last AI message into the final output payload."""
    last_ai_message = _get_last_ai_message(state.get("messages", []))
    if last_ai_message is None:
        return {
            "terminal_error": {
                "type": "agent_execution_error",
                "message": "Agent execution completed without a final AI message.",
                "source_node": "agent_finalize_output",
                "retryable": False,
            }
        }

    message = normalize_message_content(last_ai_message).strip()
    if not message:
        return {
            "terminal_error": {
                "type": "agent_execution_error",
                "message": "Final AI message was empty.",
                "source_node": "agent_finalize_output",
                "retryable": False,
            }
        }

    return {"final_output": {"message": message}}

async def agent_submit_reply(state: AgentExecutionState) -> AgentExecutionState:
    """Submit the terminal reply through the active A2A updater when available."""
    reply = _resolve_terminal_reply_text(state)
    if not reply:
        return {}

    try:
        updater = get_current_updater()
    except RuntimeError:
        logger.debug("No TaskUpdater available; skip reply submit from agent_execution subgraph.")
        return {}

    message = updater.new_agent_message(parts=[create_text_part(reply)])
    await updater.complete(message)
    return {}


def subgraph_output_transform(state: AgentExecutionState) -> AgentExecutionState:
    """Map the message-native subgraph state back to the outer graph contract."""
    tool_call_history = _build_tool_call_history(state.get("messages", []))
    final_output = dict(state.get("final_output", {}))
    terminal_error = state.get("terminal_error")

    if final_output.get("message") and not terminal_error:
        return {
            "outer_state_patch": {
                "status": "completed",
                "next_action": "agent_execution",
                "execution_result": {
                    "type": "agent_final_output",
                    "message": final_output["message"],
                    "tool_call_history": tool_call_history,
                },
                "tool_call_history": tool_call_history,
            }
        }

    error_message = (
        str(terminal_error.get("message", "")).strip()
        if isinstance(terminal_error, dict)
        else "Agent execution did not complete."
    )
    return {
        "outer_state_patch": {
            "status": "failed",
            "next_action": "agent_execution",
            "error": terminal_error
            or {
                "type": "agent_execution_error",
                "message": error_message or "Agent execution did not complete.",
                "source_node": "subgraph_output_transform",
                "retryable": False,
            },
            "execution_result": {
                "type": "agent_execution_unfinished",
                "message": USER_VISIBLE_UNFINISHED_MESSAGE,
                "tool_call_history": tool_call_history,
                "unfinished": True,
            },
            "tool_call_history": tool_call_history,
        }
    }


async def _build_system_prompt(
    *,
    selected_tools: list[dict[str, Any]],
) -> str:
    tool_names = ", ".join(
        str(tool.get("name", "")).strip()
        for tool in selected_tools
        if str(tool.get("name", "")).strip()
    )
    if not tool_names:
        tool_names = "(none)"

    mcp_prompt = ""
    try:
        client = get_mcp_client()
        if client is not None:
            settings = get_settings()
            mcp_settings = settings.agent.home_assistant_mcp
            if mcp_settings is not None:
                mcp_prompt = await build_mcp_prompts_context(
                    client=client,
                    server_name=mcp_settings.server_name,
                )
    except Exception as exc:
        logger.info(f"Failed to retrieve MCP system prompt: {exc}")

    return (
        """
你是智能家居控制助手。你的目标是：准确理解用户意图，并在需要时调用工具完成查询或控制。

请严格遵循以下规则：
1. 先判断任务类型：
   - 设备控制/状态查询：优先通过工具执行。
   - 闲聊或纯知识问答（与设备无关）：可直接自然语言回复。
2. 当用户未明确下达设备指令，但描述了行为或场景时，需要推断其隐含控制目标，并执行最合理的操作。
3. 用户提到的设备未必完全匹配工具列表中的设备名称。传入 Hass tool 的 `name` 字段**必须**来源于<mcp_prompt>中提供的设备名字。区域名字同理。**严禁**不经考虑将用户提到的实体直接传入。
4. 工具调用失败时，允许重试 1 - 2 次；若仍失败，必须明确告知失败原因或限制。
5. 严禁编造工具结果、设备状态或执行记录。
6. 当你需要调用工具时，**必须**在输出 toolcall 前先给出一段简短思考，思考内容**严禁**超过 100 字。
7. 无论是否调用工具，最后都必须给出一段面向用户的自然语言回复。

回复风格要求：简洁、明确、可执行；若已完成操作，要说明关键结果；若未完成，要说明下一步建议。
"""
        f"\n候选工具: {tool_names}"
        f"\n以下是厂商提示词（可参考并与上述规则结合使用）:\n{mcp_prompt}"
    )


def _get_last_ai_message(messages: list[BaseMessage]) -> AIMessage | None:
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            return message
    return None


def _resolve_terminal_reply_text(state: AgentExecutionState) -> str:
    if state.get("terminal_error"):
        return USER_VISIBLE_UNFINISHED_MESSAGE
    final_output = dict(state.get("final_output", {}))
    return str(final_output.get("message", "")).strip()


async def _awrap_tool_call(
    request: ToolCallRequest,
    execute: Any,
) -> ToolMessage | Command:
    tool_name = request.tool_call.get("name", "未知工具").strip()
    tool_call_id = str(request.tool_call.get("id", "")).strip()
    await _send_tool_status_update(f"正在执行 {tool_name}")

    try:
        result = await execute(request)
    except Exception as exc:
        await _send_tool_status_update(f"执行 {tool_name} 失败")
        return _build_tool_error_command(
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            error_content=f"{type(exc).__name__}: {exc}",
        )

    if isinstance(result, ToolMessage) and result.status == "error":
        await _send_tool_status_update(f"执行 {tool_name} 失败")
        return _build_tool_error_command(
            tool_name=tool_name,
            tool_call_id=result.tool_call_id or tool_call_id,
            error_content=result.content,
        )

    await _send_tool_status_update(f"已执行 {tool_name}")

    return result


def _build_tool_call_history(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []
    by_call_id: dict[str, dict[str, Any]] = {}

    for message in messages:
        if isinstance(message, AIMessage):
            for tool_call in message.tool_calls:
                entry = {
                    "step_index": len(history) + 1,
                    "tool_name": tool_call.get("name", ""),
                    "args_summary": _summarize_value(tool_call.get("args", {})),
                }
                history.append(entry)
                tool_call_id = str(tool_call.get("id", "")).strip()
                if tool_call_id:
                    by_call_id[tool_call_id] = entry
            continue

        if isinstance(message, ToolMessage):
            entry = by_call_id.get(message.tool_call_id)
            if entry is None:
                entry = {
                    "step_index": len(history) + 1,
                    "tool_name": message.name or "",
                    "args_summary": "",
                }
                history.append(entry)

            summary_key = "error_summary" if message.status == "error" else "result_summary"
            entry[summary_key] = _summarize_value(message.content)

    return history


async def _send_tool_status_update(text: str) -> None:
    try:
        updater = get_current_updater()
    except RuntimeError:
        logger.debug("No TaskUpdater available; skip tool status update.")
        return

    message = updater.new_agent_message(parts=[create_text_part(text)])
    await updater.update_status(TaskState.working, message)


async def _send_model_status_update(message: AIMessage) -> None:
    text = normalize_message_content(message).strip()
    if not text:
        return

    try:
        updater = get_current_updater()
    except RuntimeError:
        logger.debug("No TaskUpdater available; skip model status update.")
        return

    status_message = updater.new_agent_message(parts=[create_text_part(text)])
    await updater.update_status(TaskState.working, status_message)


def _build_tool_error_command(
    *,
    tool_name: str,
    tool_call_id: str,
    error_content: Any,
) -> Command:
    error_message = _normalize_tool_error_message(error_content)
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=error_message,
                    name=tool_name,
                    tool_call_id=tool_call_id,
                    status="error",
                )
            ],
        }
    )


def _normalize_tool_error_message(error_content: Any) -> str:
    if isinstance(error_content, str):
        text = error_content.strip()
    else:
        text = _summarize_value(error_content, limit=500)
    return text or "Tool execution failed."


def _summarize_value(value: Any, *, limit: int = 400) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except TypeError:
            text = str(value)
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _get_powerful_model(*, enable_thinking: bool = False) -> Any:
    model = get_llm_provider_registry().get(
        LLMRole.POWERFUL,
        enable_thinking=enable_thinking,
    )
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.POWERFUL.value}")
    return model


async def _load_selected_tools(
    selected_tools: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, BaseTool]]:
    client = get_mcp_client()
    selected_names = {
        str(tool.get("name", "")).strip()
        for tool in selected_tools
        if isinstance(tool, dict) and str(tool.get("name", "")).strip()
    }
    if client is None:
        return list(selected_tools), {}

    tools = await client.get_tools()
    available_tools = []
    tool_instances: dict[str, BaseTool] = {}
    for tool in tools:
        if selected_names and tool.name not in selected_names:
            continue
        tool_instances[tool.name] = tool
        available_tools.append(
            {
                "name": tool.name,
                "description": tool.description or "",
                "args_schema": _extract_tool_schema(tool),
            }
        )

    if available_tools:
        return available_tools, tool_instances
    return list(selected_tools), {}


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
