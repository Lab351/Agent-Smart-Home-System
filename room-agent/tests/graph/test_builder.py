import pytest
from langchain_core.tools import StructuredTool

from graph.builder import build_graph
from tools.mcp_tools import MCPToolService


class StaticMCPClient:
    def __init__(self, tools):
        self.tools = tools

    async def get_tools(self, *, server_name=None):
        return self.tools


@pytest.mark.asyncio
async def test_graph_completes_simple_chat_without_llm():
    graph = build_graph(llm_provider=None)

    result = await graph.ainvoke(
        {
            "run_id": "run-1",
            "request_id": "req-1",
            "session_id": "session-1",
            "input": "你好",
            "trace": [],
        }
    )

    assert result["result"]["status"] == "completed"
    assert result["result"]["intent_type"] == "simple_chat"
    assert result["result"]["response"]


@pytest.mark.asyncio
async def test_graph_marks_device_request_for_handoff():
    graph = build_graph(llm_provider=None)

    result = await graph.ainvoke(
        {
            "run_id": "run-2",
            "request_id": "req-2",
            "session_id": "session-2",
            "input": "关闭客厅的空调",
            "trace": [],
        }
    )

    assert result["result"]["status"] == "handoff_required"
    assert result["result"]["executor_type"] == "device"


@pytest.mark.asyncio
async def test_graph_executes_mcp_tool_when_available():
    async def weather_lookup(query: str) -> str:
        return f"weather:{query}"

    tool = StructuredTool.from_function(
        coroutine=weather_lookup,
        name="weather_lookup",
        description="查询天气信息",
    )
    graph = build_graph(
        llm_provider=None,
        mcp_tool_service=MCPToolService(StaticMCPClient([tool])),
    )

    result = await graph.ainvoke(
        {
            "run_id": "run-3",
            "request_id": "req-3",
            "session_id": "session-3",
            "input": "今天天气怎么样",
            "trace": [],
        }
    )

    assert result["result"]["status"] == "completed"
    assert result["result"]["executor_type"] == "mcp"
    assert result["result"]["response"] == "weather:今天天气怎么样"
