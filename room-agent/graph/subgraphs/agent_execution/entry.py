"""Agent-execution subgraph for multi-step tool-enabled execution."""

from __future__ import annotations

import json
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.server import get_llm_provider_registry, get_mcp_client
from config.settings import LLMRole
from graph.state import RoomAgentGraphState
from llm_json_parse import JsonParserWithRepair

from .state import AgentExecutionState, FinalOutput, PlannerStep


DEFAULT_STEP_LIMIT = 6
PLANNER_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "step_type": {
            "type": "string",
            "enum": ["reason", "toolcall", "final_output"],
        },
        "is_done": {"type": "boolean"},
        "reason_summary": {"type": "string"},
        "tool_name": {"type": "string"},
        "tool_args": {"type": "object"},
        "final_output": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "minLength": 1},
                "summary": {"type": ["string", "null"]},
                "metadata": {"type": ["object", "null"]},
            },
            "required": ["message"],
            "additionalProperties": False,
        },
    },
    "required": ["step_type", "is_done"],
    "additionalProperties": False,
}


async def agent_execution(state: RoomAgentGraphState) -> RoomAgentGraphState:
    """Run the internal agent-execution subgraph and return an outer-state patch."""
    result = await compile_agent_execution_subgraph().ainvoke(
        {
            "user_input": state.get("user_input", ""),
            "conversation_text": state.get("conversation_text", ""),
            "intent": dict(state.get("intent", {})),
            "selected_tools": list(state.get("selected_tools", [])),
            "metadata": dict(state.get("metadata", {})),
        }
    )
    return result.get("outer_state_patch", {})


def compile_agent_execution_subgraph() -> Any:
    """Compile the internal agent-execution subgraph."""
    graph = StateGraph(AgentExecutionState)
    graph.add_node("subgraph_input_transform", subgraph_input_transform)
    graph.add_node("agent_plan_step", agent_plan_step)
    graph.add_node("agent_dispatch_step", agent_dispatch_step)
    graph.add_node("agent_record_reason", agent_record_reason)
    graph.add_node("agent_execute_toolcall", agent_execute_toolcall)
    graph.add_node("agent_finalize_output", agent_finalize_output)
    graph.add_node("agent_handle_limit_or_error", agent_handle_limit_or_error)
    graph.add_node("subgraph_output_transform", subgraph_output_transform)

    graph.add_edge(START, "subgraph_input_transform")
    graph.add_edge("subgraph_input_transform", "agent_plan_step")
    graph.add_conditional_edges(
        "agent_plan_step",
        route_after_plan_step,
        {
            "dispatch": "agent_dispatch_step",
            "handle_error": "agent_handle_limit_or_error",
        },
    )
    graph.add_conditional_edges(
        "agent_dispatch_step",
        route_after_dispatch_step,
        {
            "reason": "agent_record_reason",
            "toolcall": "agent_execute_toolcall",
            "final_output": "agent_finalize_output",
            "handle_error": "agent_handle_limit_or_error",
        },
    )
    graph.add_edge("agent_record_reason", "agent_plan_step")
    graph.add_conditional_edges(
        "agent_execute_toolcall",
        route_after_toolcall,
        {
            "plan": "agent_plan_step",
            "handle_error": "agent_handle_limit_or_error",
        },
    )
    graph.add_edge("agent_finalize_output", "subgraph_output_transform")
    graph.add_edge("agent_handle_limit_or_error", "subgraph_output_transform")
    graph.add_edge("subgraph_output_transform", END)
    return graph.compile()


async def subgraph_input_transform(state: AgentExecutionState) -> AgentExecutionState:
    """Initialize internal state for the agent loop."""
    available_tools, tool_instances = await _load_selected_tools(state.get("selected_tools", []))
    return {
        "user_input": state.get("user_input", "").strip(),
        "conversation_text": state.get("conversation_text", "").strip()
        or state.get("user_input", "").strip(),
        "intent": dict(state.get("intent", {})),
        "metadata": dict(state.get("metadata", {})),
        "available_tools": available_tools,
        "available_tool_instances": tool_instances,
        "step_count": 0,
        "step_limit": DEFAULT_STEP_LIMIT,
        "step_history": [],
        "raw_model_outputs": [],
        "tool_results": [],
        "replan_used": False,
    }


async def agent_plan_step(state: AgentExecutionState) -> AgentExecutionState:
    """Plan the next agent step with the powerful model."""
    if state.get("step_count", 0) >= state.get("step_limit", DEFAULT_STEP_LIMIT):
        return {
            "loop_decision": "handle_error",
            "terminal_error": {
                "type": "agent_step_limit_exceeded",
                "message": (
                    f"Agent step limit exceeded before completion "
                    f"(limit={state.get('step_limit', DEFAULT_STEP_LIMIT)})."
                ),
                "source_node": "agent_plan_step",
                "retryable": False,
            },
        }

    provider = _get_powerful_provider()
    raw_output = await provider.complete_text(
        _build_planner_messages(state),
        temperature=0,
        json_mode=True,
    )
    parsed = await JsonParserWithRepair(llm_provider=provider)(
        raw_output,
        schema=PLANNER_OUTPUT_SCHEMA,
    )
    current_step = _normalize_planner_step(parsed)
    _validate_planner_step(current_step)

    raw_model_outputs = list(state.get("raw_model_outputs", []))
    raw_model_outputs.append(raw_output)

    return {
        "current_step": current_step,
        "raw_model_outputs": raw_model_outputs,
        "step_count": state.get("step_count", 0) + 1,
        "loop_decision": "dispatch",
    }


def agent_dispatch_step(state: AgentExecutionState) -> AgentExecutionState:
    """No-op node used to keep dispatch logic explicit in the graph."""
    current_step = state.get("current_step", {})
    if not current_step:
        return {
            "loop_decision": "handle_error",
            "terminal_error": {
                "type": "agent_dispatch_error",
                "message": "Planner did not produce a current_step.",
                "source_node": "agent_dispatch_step",
                "retryable": False,
            },
        }
    return {}


def agent_record_reason(state: AgentExecutionState) -> AgentExecutionState:
    """Record a reasoning-only step and continue the loop."""
    current_step = state.get("current_step", {})
    step_history = list(state.get("step_history", []))
    step_history.append(
        {
            "step_index": state.get("step_count", 0),
            "step_type": "reason",
            "reason_summary": current_step.get("reason_summary", "").strip(),
        }
    )
    return {"step_history": step_history}


async def agent_execute_toolcall(state: AgentExecutionState) -> AgentExecutionState:
    """Execute a single tool call and either continue or fail."""
    current_step = state.get("current_step", {})
    tool_name = str(current_step.get("tool_name", "")).strip()
    tool_args = current_step.get("tool_args", {}) or {}
    tool_instances = state.get("available_tool_instances", {})
    tool = tool_instances.get(tool_name)
    if tool is None:
        return _build_tool_failure_state(
            state,
            tool_name=tool_name,
            tool_args=tool_args,
            error_message=f"Tool '{tool_name}' is not available.",
            source_node="agent_execute_toolcall",
        )

    try:
        observation = await _invoke_tool(tool, tool_args)
    except Exception as exc:
        return _build_tool_failure_state(
            state,
            tool_name=tool_name,
            tool_args=tool_args,
            error_message=f"{type(exc).__name__}: {exc}",
            source_node="agent_execute_toolcall",
        )

    tool_results = list(state.get("tool_results", []))
    step_history = list(state.get("step_history", []))
    result_summary = _summarize_value(observation)
    tool_results.append(
        {
            "step_index": state.get("step_count", 0),
            "tool_name": tool_name,
            "tool_args": tool_args,
            "observation": observation,
            "args_summary": _summarize_value(tool_args),
            "result_summary": result_summary,
        }
    )
    step_history.append(
        {
            "step_index": state.get("step_count", 0),
            "step_type": "toolcall",
            "tool_name": tool_name,
            "args_summary": _summarize_value(tool_args),
            "result_summary": result_summary,
        }
    )
    return {
        "tool_results": tool_results,
        "step_history": step_history,
        "loop_decision": "plan",
    }


def agent_finalize_output(state: AgentExecutionState) -> AgentExecutionState:
    """Persist the final output and prepare to exit the subgraph."""
    current_step = state.get("current_step", {})
    final_output = current_step.get("final_output", {})
    step_history = list(state.get("step_history", []))
    step_history.append(
        {
            "step_index": state.get("step_count", 0),
            "step_type": "final_output",
            "message": final_output.get("message", ""),
            "summary": final_output.get("summary"),
        }
    )
    return {
        "final_output": final_output,
        "step_history": step_history,
    }


def agent_handle_limit_or_error(state: AgentExecutionState) -> AgentExecutionState:
    """Build terminal error state for an unfinished agent run."""
    terminal_error = dict(state.get("terminal_error", {}))
    if not terminal_error:
        terminal_error = {
            "type": "agent_execution_error",
            "message": "Agent execution failed without a structured error.",
            "source_node": "agent_handle_limit_or_error",
            "retryable": False,
        }
    return {"terminal_error": terminal_error}


def subgraph_output_transform(state: AgentExecutionState) -> AgentExecutionState:
    """Map the internal terminal state back to the outer graph state."""
    tool_call_history = _build_tool_call_history(state.get("tool_results", []))
    final_output = _normalize_final_output(state.get("final_output"))
    terminal_error = state.get("terminal_error")

    if final_output and not terminal_error:
        execution_result = {
            "type": "agent_final_output",
            "message": final_output["message"],
            "tool_call_history": tool_call_history,
        }
        if final_output.get("summary") is not None:
            execution_result["summary"] = final_output.get("summary")
        if final_output.get("metadata") is not None:
            execution_result["metadata"] = final_output.get("metadata")
        outer_patch: RoomAgentGraphState = {
            "status": "completed",
            "next_action": "agent_execution",
            "execution_result": execution_result,
            "tool_call_history": tool_call_history,
        }
        return {"outer_state_patch": outer_patch}

    error_message = (
        str(terminal_error.get("message", "")).strip()
        if isinstance(terminal_error, dict)
        else "Agent execution did not complete."
    )
    outer_patch = {
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
            "message": error_message or "任务未完成。",
            "tool_call_history": tool_call_history,
            "unfinished": True,
        },
        "tool_call_history": tool_call_history,
    }
    return {"outer_state_patch": outer_patch}


def route_after_plan_step(state: AgentExecutionState) -> str:
    """Route after planning."""
    return state.get("loop_decision", "handle_error")


def route_after_dispatch_step(state: AgentExecutionState) -> str:
    """Dispatch the current planner step."""
    if state.get("loop_decision") == "handle_error":
        return "handle_error"
    current_step = state.get("current_step", {})
    return str(current_step.get("step_type", "handle_error"))


def route_after_toolcall(state: AgentExecutionState) -> str:
    """Route after a tool call finishes."""
    return state.get("loop_decision", "handle_error")


def _normalize_planner_step(parsed: dict[str, Any]) -> PlannerStep:
    step: PlannerStep = {
        "step_type": str(parsed["step_type"]),
        "is_done": bool(parsed["is_done"]),
    }
    if "reason_summary" in parsed:
        step["reason_summary"] = str(parsed.get("reason_summary") or "").strip()
    if "tool_name" in parsed:
        step["tool_name"] = str(parsed.get("tool_name") or "").strip()
    if "tool_args" in parsed and isinstance(parsed["tool_args"], dict):
        step["tool_args"] = parsed["tool_args"]
    if "final_output" in parsed and isinstance(parsed["final_output"], dict):
        step["final_output"] = _normalize_final_output(parsed["final_output"])
    return step


def _normalize_final_output(payload: dict[str, Any] | FinalOutput | None) -> FinalOutput:
    if not payload:
        return {}
    normalized: FinalOutput = {"message": str(payload.get("message", "")).strip()}
    if payload.get("summary") is not None:
        normalized["summary"] = str(payload.get("summary"))
    if payload.get("metadata") is not None and isinstance(payload.get("metadata"), dict):
        normalized["metadata"] = payload.get("metadata")
    return normalized


def _validate_planner_step(step: PlannerStep) -> None:
    step_type = step.get("step_type")
    is_done = bool(step.get("is_done"))
    if step_type == "reason":
        if is_done:
            raise ValueError("Planner step_type=reason must have is_done=false.")
        if not step.get("reason_summary"):
            raise ValueError("Planner step_type=reason requires reason_summary.")
        return
    if step_type == "toolcall":
        if is_done:
            raise ValueError("Planner step_type=toolcall must have is_done=false.")
        if not step.get("tool_name"):
            raise ValueError("Planner step_type=toolcall requires tool_name.")
        if not isinstance(step.get("tool_args", {}), dict):
            raise ValueError("Planner step_type=toolcall requires tool_args object.")
        return
    if step_type == "final_output":
        if not is_done:
            raise ValueError("Planner step_type=final_output must have is_done=true.")
        final_output = step.get("final_output", {})
        if not final_output.get("message"):
            raise ValueError("Planner step_type=final_output requires final_output.message.")
        return
    raise ValueError(f"Unsupported planner step_type={step_type!r}.")


def _build_planner_messages(state: AgentExecutionState) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 Room Agent 的 agent planner。"
                "你每轮只能输出一个 step。"
                "合法 step_type 只有 reason、toolcall、final_output。"
                "reason 只用于记录简短推理摘要，不执行工具，必须 is_done=false。"
                "toolcall 只调用一个工具，必须提供 tool_name 和 tool_args，且 is_done=false。"
                "final_output 是唯一正常完成信号，必须提供 final_output.message，且 is_done=true。"
                "不要输出额外解释，只输出 JSON。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "task": "根据当前对话、工具上下文和执行历史，决定下一步单步行动。",
                    "user_input": state.get("user_input", ""),
                    "conversation_text": state.get("conversation_text", ""),
                    "intent": state.get("intent", {}),
                    "available_tools": state.get("available_tools", []),
                    "step_count": state.get("step_count", 0),
                    "step_limit": state.get("step_limit", DEFAULT_STEP_LIMIT),
                    "step_history": state.get("step_history", []),
                    "tool_results": state.get("tool_results", []),
                    "replan_used": state.get("replan_used", False),
                },
                ensure_ascii=False,
                default=str,
            ),
        },
    ]


def _get_powerful_provider() -> Any:
    provider = get_llm_provider_registry().get(LLMRole.POWERFUL)
    if provider is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.POWERFUL.value}")
    return provider


async def _load_selected_tools(
    selected_tools: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
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
    tool_instances = {}
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
    return available_tools, tool_instances


async def _invoke_tool(tool: Any, tool_args: dict[str, Any]) -> Any:
    if hasattr(tool, "ainvoke"):
        return await tool.ainvoke(tool_args)
    if hasattr(tool, "arun"):
        return await tool.arun(tool_args)
    if hasattr(tool, "invoke"):
        return tool.invoke(tool_args)
    if hasattr(tool, "run"):
        return tool.run(tool_args)
    raise RuntimeError(f"Tool {getattr(tool, 'name', '<unknown>')} is not invokable.")


def _extract_tool_schema(tool: Any) -> dict[str, Any]:
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


def _build_tool_failure_state(
    state: AgentExecutionState,
    *,
    tool_name: str,
    tool_args: dict[str, Any],
    error_message: str,
    source_node: str,
) -> AgentExecutionState:
    tool_results = list(state.get("tool_results", []))
    step_history = list(state.get("step_history", []))
    entry = {
        "step_index": state.get("step_count", 0),
        "tool_name": tool_name,
        "tool_args": tool_args,
        "error": error_message,
        "args_summary": _summarize_value(tool_args),
        "error_summary": _summarize_value(error_message),
    }
    tool_results.append(entry)
    step_history.append(
        {
            "step_index": state.get("step_count", 0),
            "step_type": "toolcall",
            "tool_name": tool_name,
            "args_summary": entry["args_summary"],
            "error_summary": entry["error_summary"],
        }
    )
    if not state.get("replan_used", False):
        return {
            "tool_results": tool_results,
            "step_history": step_history,
            "replan_used": True,
            "loop_decision": "plan",
        }

    return {
        "tool_results": tool_results,
        "step_history": step_history,
        "loop_decision": "handle_error",
        "terminal_error": {
            "type": "tool_execution_error",
            "message": error_message,
            "source_node": source_node,
            "retryable": False,
        },
    }


def _build_tool_call_history(tool_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    history = []
    for entry in tool_results:
        item = {
            "step_index": entry.get("step_index"),
            "tool_name": entry.get("tool_name"),
            "args_summary": entry.get("args_summary", ""),
        }
        if entry.get("result_summary"):
            item["result_summary"] = entry["result_summary"]
        if entry.get("error_summary"):
            item["error_summary"] = entry["error_summary"]
        history.append(item)
    return history


def _summarize_value(value: Any, *, limit: int = 180) -> str:
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
