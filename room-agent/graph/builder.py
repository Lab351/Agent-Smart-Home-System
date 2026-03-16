"""Graph builder for the rebuilt room-agent runtime."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from graph.nodes.classify_intent import IntentClassifierNode
from graph.nodes.finalize import finalize_node
from graph.nodes.simple_chat import SimpleChatNode
from graph.nodes.task_router import route_after_classification
from graph.state import GraphState
from integrations.llm_provider import ChatProvider
from graph.subgraphs.mcp_workflow import build_mcp_workflow
from tools.mcp_tools import MCPToolService


def build_graph(
    llm_provider: ChatProvider | None,
    mcp_tool_service: MCPToolService | None = None,
):
    workflow = StateGraph(GraphState)
    mcp_tool_service = mcp_tool_service or MCPToolService(client=None)

    workflow.add_node("classify_intent", IntentClassifierNode(llm_provider))
    workflow.add_node("simple_chat", SimpleChatNode(llm_provider))
    workflow.add_node("mcp_workflow", build_mcp_workflow(mcp_tool_service, llm_provider))
    workflow.add_node("finalize", finalize_node)

    workflow.add_edge(START, "classify_intent")
    workflow.add_conditional_edges(
        "classify_intent",
        route_after_classification,
        {
            "simple_chat": "simple_chat",
            "mcp": "mcp_workflow",
            "device": "finalize",
            "error": "finalize",
        },
    )
    workflow.add_edge("simple_chat", "finalize")
    workflow.add_edge("mcp_workflow", "finalize")
    workflow.add_edge("finalize", END)
    return workflow.compile()
