from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool, tool

from app.server import initialize_runtime_dependencies
from config.settings import LLMRole
from graph.entry import compile_graph


class FakeRegistry:
    def __init__(self, *, powerful: Any, low_cost: Any) -> None:
        self._providers = {
            LLMRole.POWERFUL: powerful,
            LLMRole.LOW_COST: low_cost,
        }

    def get(self, role: LLMRole) -> Any:
        return self._providers.get(role)


class FakeMCPClient:
    def __init__(self, tools: list[BaseTool]) -> None:
        self._tools = tools

    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]:
        _ = server_name
        return self._tools

    async def list_prompts(self, server_name: str) -> dict[str, Any]:
        _ = server_name
        return {"prompts": []}


class FakeLowCostProvider:
    def __init__(self, *, need_tool_call: bool, direct_reply: str = "你好，我在。") -> None:
        self.need_tool_call = need_tool_call
        self.direct_reply = direct_reply

    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        _ = (temperature, json_mode)
        system_prompt = messages[0]["content"]
        if "意图分析节点" in system_prompt:
            return (
                '{"intent_name":"device_control","need_tool_call":true}'
                if self.need_tool_call
                else '{"intent_name":"chat","need_tool_call":false}'
            )
        if "工具选择节点" in system_prompt:
            return '{"selected_tool_names":["light_control"],"comment":"selected"}'
        return self.direct_reply

    async def invoke_messages(
        self,
        messages: list[BaseMessage],
        *,
        temperature: float | None = None,
        tools: Sequence[BaseTool] | None = None,
    ) -> AIMessage:
        _ = (messages, temperature, tools)
        raise AssertionError("Low-cost provider should not be used for message-native tool calls.")

    def bind_tools(
        self,
        tools: Sequence[BaseTool],
        *,
        temperature: float | None = None,
    ) -> Any:
        _ = (tools, temperature)
        raise AssertionError("Low-cost provider should not bind tools in smoke tests.")


class _FakeBoundModel:
    def __init__(self, provider: "FakePowerfulProvider", tools: Sequence[BaseTool]) -> None:
        self._provider = provider
        self._tools = list(tools)

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        return await self._provider._ainvoke(messages, self._tools)


class FakePowerfulProvider:
    def __init__(
        self,
        *,
        final_message: str = "卧室灯已打开。",
        tool_args: dict[str, Any] | None = None,
    ) -> None:
        self.final_message = final_message
        self.tool_args = tool_args or {"entity_id": "light.bedroom"}

    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        _ = (messages, temperature, json_mode)
        raise AssertionError("Powerful provider should use message-native invocation in smoke tests.")

    async def invoke_messages(
        self,
        messages: list[BaseMessage],
        *,
        temperature: float | None = None,
        tools: Sequence[BaseTool] | None = None,
    ) -> AIMessage:
        return await self.bind_tools(tools or [], temperature=temperature).ainvoke(messages)

    def bind_tools(
        self,
        tools: Sequence[BaseTool],
        *,
        temperature: float | None = None,
    ) -> _FakeBoundModel:
        _ = temperature
        return _FakeBoundModel(self, tools)

    async def _ainvoke(
        self,
        messages: list[BaseMessage],
        tools: Sequence[BaseTool],
    ) -> AIMessage:
        if any(isinstance(message, ToolMessage) for message in messages):
            return AIMessage(content=self.final_message)
        if not tools:
            return AIMessage(content="当前没有可用工具。")

        tool_name = getattr(tools[0], "name", "tool")
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": tool_name,
                    "args": self.tool_args,
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        )


def build_light_control_tool(calls: list[str]) -> BaseTool:
    @tool
    async def light_control(entity_id: str) -> str:
        """Control the bedroom light."""
        calls.append(entity_id)
        return f"已执行 {entity_id}"

    return light_control


def build_failing_light_control_tool(calls: list[str]) -> BaseTool:
    @tool
    async def light_control(entity_id: str) -> str:
        """Control the bedroom light."""
        calls.append(entity_id)
        raise RuntimeError("ha failed")

    return light_control


def _initialize_fake_runtime(
    *,
    need_tool_call: bool,
    tools: list[BaseTool] | None = None,
    direct_reply: str = "你好，我在。",
    final_message: str = "卧室灯已打开。",
) -> list[str]:
    tool_calls: list[str] = []
    runtime_tools = tools or []
    low_cost = FakeLowCostProvider(need_tool_call=need_tool_call, direct_reply=direct_reply)
    powerful = FakePowerfulProvider(final_message=final_message)
    initialize_runtime_dependencies(
        settings=object(),
        llm_provider_registry=FakeRegistry(powerful=powerful, low_cost=low_cost),
        mcp_client=FakeMCPClient(runtime_tools),
    )
    return tool_calls


def test_graph_smoke_routes_chat_to_direct_response() -> None:
    _initialize_fake_runtime(need_tool_call=False, direct_reply="你好，我在。")

    final_state = asyncio.run(compile_graph().ainvoke({"user_input": "你好"}))

    assert final_state["need_tool_call"] is False
    assert final_state["next_action"] == "direct_response"
    assert final_state["execution_result"]["type"] == "text"
    assert final_state["execution_result"]["message"] == "你好，我在。"


def test_graph_smoke_executes_tool_call_with_toolnode() -> None:
    tool_calls: list[str] = []
    light_tool = build_light_control_tool(tool_calls)
    _initialize_fake_runtime(need_tool_call=True, tools=[light_tool], final_message="卧室灯已打开。")

    final_state = asyncio.run(compile_graph().ainvoke({"user_input": "帮我打开卧室灯"}))

    assert final_state["need_tool_call"] is True
    assert final_state["next_action"] == "agent_execution"
    assert final_state["status"] == "completed"
    assert final_state["execution_result"]["message"] == "卧室灯已打开。"
    assert tool_calls == ["light.bedroom"]
    assert final_state["tool_call_history"][0]["tool_name"] == "light_control"
    assert "light.bedroom" in final_state["tool_call_history"][0]["result_summary"]


def test_graph_smoke_returns_structured_failure_when_tool_raises() -> None:
    tool_calls: list[str] = []
    light_tool = build_failing_light_control_tool(tool_calls)
    _initialize_fake_runtime(need_tool_call=True, tools=[light_tool], final_message="不应到达")

    final_state = asyncio.run(compile_graph().ainvoke({"user_input": "帮我打开卧室灯"}))

    assert final_state["need_tool_call"] is True
    assert final_state["next_action"] == "agent_execution"
    assert final_state["status"] == "failed"
    assert final_state["error"]["type"] == "tool_execution_error"
    assert "RuntimeError: ha failed" in final_state["error"]["message"]
    assert final_state["execution_result"]["type"] == "agent_execution_unfinished"
    assert final_state["execution_result"]["unfinished"] is True
    assert tool_calls == ["light.bedroom"]
    assert final_state["tool_call_history"][0]["tool_name"] == "light_control"
    assert "RuntimeError: ha failed" in final_state["tool_call_history"][0]["error_summary"]
