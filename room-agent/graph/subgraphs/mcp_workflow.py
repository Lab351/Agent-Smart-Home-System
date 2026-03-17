"""Minimal MCP workflow subgraph."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from langgraph.graph import END, START, StateGraph

from graph.state import GraphState
from integrations.llm_provider import ChatProvider
from tools.mcp_tools import MCPToolService


class ChooseMCPToolNode:
    def __init__(self, tool_service: MCPToolService, llm_provider: ChatProvider | None) -> None:
        self.tool_service = tool_service
        self.llm_provider = llm_provider

    async def __call__(self, state: GraphState) -> GraphState:
        selected_tool = await self.tool_service.choose_tool(
            state["input"],
            llm_provider=self.llm_provider,
        )
        if selected_tool is None:
            return {
                "mcp": {
                    "selected_tool": None,
                    "result": {
                        "success": False,
                        "error": "No matching MCP tool found",
                    },
                },
                "trace": [
                    {
                        "node": "choose_mcp_tool",
                        "event": "no_tool_selected",
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                ],
            }

        return {
            "mcp": {
                "selected_tool": selected_tool.model_dump(),
            },
            "trace": [
                {
                    "node": "choose_mcp_tool",
                    "event": "tool_selected",
                    "tool_name": selected_tool.name,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            ],
        }


class CallMCPToolNode:
    def __init__(self, tool_service: MCPToolService) -> None:
        self.tool_service = tool_service

    async def __call__(self, state: GraphState) -> GraphState:
        selected_tool = state.get("mcp", {}).get("selected_tool")
        if not selected_tool:
            return {}

        result = await self.tool_service.invoke_tool(
            selected_tool["name"],
            state["input"],
        )
        response = ""
        if result.success:
            response = _format_tool_result(result.result)

        return {
            "mcp": {
                "selected_tool": selected_tool,
                "result": result.model_dump(),
            },
            "response": response,
            "trace": [
                {
                    "node": "call_mcp_tool",
                    "event": "tool_called",
                    "tool_name": selected_tool["name"],
                    "success": result.success,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            ],
        }


def build_mcp_workflow(
    tool_service: MCPToolService,
    llm_provider: ChatProvider | None,
):
    workflow = StateGraph(GraphState)
    workflow.add_node("choose_tool", ChooseMCPToolNode(tool_service, llm_provider))
    workflow.add_node("call_tool", CallMCPToolNode(tool_service))

    workflow.add_edge(START, "choose_tool")
    workflow.add_conditional_edges(
        "choose_tool",
        route_after_tool_selection,
        {
            "call_tool": "call_tool",
            "end": END,
        },
    )
    workflow.add_edge("call_tool", END)
    return workflow.compile()


def route_after_tool_selection(state: GraphState) -> Literal["call_tool", "end"]:
    selected_tool = state.get("mcp", {}).get("selected_tool")
    return "call_tool" if selected_tool else "end"


def _format_tool_result(result: object) -> str:
    if isinstance(result, str):
        return result
    return str(result)
