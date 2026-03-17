"""Finalize node for the rebuilt LangGraph runtime."""

from __future__ import annotations

from datetime import UTC, datetime

from graph.state import GraphState


def finalize_node(state: GraphState) -> GraphState:
    error = state.get("error")
    intent = state.get("intent", {})
    mcp_result = state.get("mcp", {}).get("result")
    executor_type = intent.get("executor_type")
    intent_type = intent.get("type", "unknown")

    status = "completed"
    if error:
        status = "failed"
    elif mcp_result and mcp_result.get("success"):
        status = "completed"
    elif intent_type == "task_request":
        status = "handoff_required"

    response = state.get("response", "")
    if not response and status == "handoff_required":
        if executor_type == "device":
            response = "已识别为设备控制请求，下一阶段会接入设备工具执行。"
        else:
            response = "已识别为外部任务请求，下一阶段会接入 MCP 工作流执行。"

    return {
        "result": {
            "run_id": state["run_id"],
            "request_id": state["request_id"],
            "session_id": state["session_id"],
            "status": status,
            "intent_type": intent_type,
            "executor_type": executor_type,
            "response": response,
            "task": state.get("task"),
            "mcp": state.get("mcp"),
            "error": error,
        },
        "trace": [
            {
                "node": "finalize",
                "event": "completed",
                "status": status,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        ],
    }
