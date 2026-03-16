import pytest
from langchain_core.tools import StructuredTool

from tools.mcp_tools import MCPToolService


class StaticMCPClient:
    def __init__(self, tools):
        self.tools = tools

    async def get_tools(self, *, server_name=None):
        return self.tools


@pytest.mark.asyncio
async def test_choose_tool_uses_heuristic_match():
    async def weather_lookup(query: str) -> str:
        return query

    async def calendar_lookup(query: str) -> str:
        return query

    service = MCPToolService(
        StaticMCPClient(
            [
                StructuredTool.from_function(
                    coroutine=weather_lookup,
                    name="weather_lookup",
                    description="查询天气信息",
                ),
                StructuredTool.from_function(
                    coroutine=calendar_lookup,
                    name="calendar_lookup",
                    description="查询日历信息",
                ),
            ]
        )
    )

    selected = await service.choose_tool("帮我查一下天气", llm_provider=None)

    assert selected is not None
    assert selected.name == "weather_lookup"


@pytest.mark.asyncio
async def test_invoke_tool_standardizes_result():
    async def weather_lookup(query: str) -> str:
        return f"ok:{query}"

    service = MCPToolService(
        StaticMCPClient(
            [
                StructuredTool.from_function(
                    coroutine=weather_lookup,
                    name="weather_lookup",
                    description="查询天气信息",
                )
            ]
        )
    )

    result = await service.invoke_tool("weather_lookup", "上海天气")

    assert result.success is True
    assert result.tool_name == "weather_lookup"
    assert result.result == "ok:上海天气"
