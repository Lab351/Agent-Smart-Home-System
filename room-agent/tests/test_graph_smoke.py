from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool, tool

from app.server import initialize_runtime_dependencies
from config.settings import LLMRole
from graph.nodes.direct_response import direct_response
from graph.nodes.intent_recognition import intent_recognition, route_after_intent
from graph.nodes.tool_selection import tool_selection
from graph.nodes.tool_selection.node import TOOL_CATALOG_TOKEN_THRESHOLD
from graph.subgraphs.agent_execution.entry import (
    agent_call_model,
    agent_finalize_output,
    compile_agent_execution_subgraph,
)


class FakeRegistry:
    def __init__(self, *, powerful: Any = None, low_cost: Any = None) -> None:
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


class _FakeTextRunnable:
    def __init__(self, model: "FakeLowCostModel") -> None:
        self._model = model

    def bind(self, **kwargs: Any) -> "_FakeTextRunnable":
        _ = kwargs
        return self

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        return await self._model.ainvoke(messages)


class _FakeStructuredRunnable:
    def __init__(self, model: "FakeLowCostModel") -> None:
        self._model = model

    def bind(self, **kwargs: Any) -> "_FakeStructuredRunnable":
        _ = kwargs
        return self

    async def ainvoke(self, messages: list[BaseMessage]) -> dict[str, Any]:
        _ = messages
        if self._model.structured_result is None:
            raise AssertionError("Structured output was not configured.")
        return self._model.structured_result


class FakeLowCostModel:
    def __init__(
        self,
        *,
        text_result: Any = "你好，我在。",
        structured_result: dict[str, Any] | None = None,
        structured_error: Exception | None = None,
    ) -> None:
        self.text_result = text_result
        self.structured_result = structured_result
        self.structured_error = structured_error

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        _ = messages
        return AIMessage(content=self.text_result)

    def bind(self, **kwargs: Any) -> _FakeTextRunnable:
        _ = kwargs
        return _FakeTextRunnable(self)

    def with_structured_output(
        self,
        schema: dict[str, Any] | None = None,
        *,
        method: str = "json_schema",
        include_raw: bool = False,
        strict: bool | None = None,
        tools: list[Any] | None = None,
        **kwargs: Any,
    ) -> _FakeStructuredRunnable:
        _ = (schema, method, include_raw, strict, tools, kwargs)
        if self.structured_error is not None:
            raise self.structured_error
        return _FakeStructuredRunnable(self)


class _FakeBoundModel:
    def __init__(self, model: "FakePowerfulModel", tools: list[BaseTool]) -> None:
        self._model = model
        self._tools = tools

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        return await self._model._ainvoke(messages, self._tools)


class FakePowerfulModel:
    def __init__(
        self,
        *,
        final_message: str = "卧室灯已打开。",
        tool_args: dict[str, Any] | None = None,
    ) -> None:
        self.final_message = final_message
        self.tool_args = tool_args or {"entity_id": "light.bedroom"}

    def bind(self, **kwargs: Any) -> _FakeBoundModel:
        _ = kwargs
        return _FakeBoundModel(self, [])

    def bind_tools(self, tools: list[BaseTool], **kwargs: Any) -> _FakeBoundModel:
        _ = kwargs
        return _FakeBoundModel(self, tools)

    async def _ainvoke(self, messages: list[BaseMessage], tools: list[BaseTool]) -> AIMessage:
        if any(isinstance(message, ToolMessage) for message in messages):
            return AIMessage(content=self.final_message)
        if not tools:
            return AIMessage(content="当前没有可用工具。")
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": tools[0].name,
                    "args": self.tool_args,
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        )


def _initialize_runtime(
    *,
    low_cost: Any = None,
    powerful: Any = None,
    mcp_client: Any = None,
) -> None:
    initialize_runtime_dependencies(
        settings=SimpleNamespace(agent=SimpleNamespace(home_assistant_mcp=None)),
        llm_provider_registry=FakeRegistry(powerful=powerful, low_cost=low_cost),
        mcp_client=mcp_client,
    )


def build_light_control_tool(calls: list[str]) -> BaseTool:
    @tool
    async def light_control(entity_id: str) -> str:
        """Control the bedroom light."""
        calls.append(entity_id)
        return f"已执行 {entity_id}"

    return light_control


def build_weather_query_tool(calls: list[str], *, description: str = "Query the weather.") -> BaseTool:
    @tool(description=description)
    async def weather_query(city: str) -> str:
        calls.append(city)
        return f"{city} 晴"

    return weather_query


def test_intent_recognition_uses_json_schema_output() -> None:
    _initialize_runtime(
        low_cost=FakeLowCostModel(
            structured_result={"intent_name": "chat", "need_tool_call": False}
        )
    )

    result = asyncio.run(intent_recognition({"user_input": "你好", "conversation_text": "你好"}))

    assert result["intent"] == {"name": "chat"}
    assert result["need_tool_call"] is False
    assert result["next_action"] == "direct_response"


def test_intent_recognition_falls_back_to_local_json_parser() -> None:
    _initialize_runtime(
        low_cost=FakeLowCostModel(
            text_result='```json\n{"intent_name":"chat","need_tool_call":false}\n```',
            structured_error=NotImplementedError("json_schema not supported"),
        )
    )

    result = asyncio.run(intent_recognition({"user_input": "你好", "conversation_text": "你好"}))

    assert result["intent"] == {"name": "chat"}
    assert result["need_tool_call"] is False


def test_route_after_intent_uses_need_tool_call_flag() -> None:
    assert route_after_intent({"need_tool_call": True}) == "tool_selection"
    assert route_after_intent({"need_tool_call": False}) == "direct_response"


def test_direct_response_normalizes_message_content() -> None:
    _initialize_runtime(low_cost=FakeLowCostModel(text_result=[{"text": "你好，我在。"}]))

    result = asyncio.run(direct_response({"user_input": "你好", "conversation_text": "你好"}))

    assert result["execution_result"]["type"] == "text"
    assert result["execution_result"]["message"] == "你好，我在。"


def test_tool_selection_passes_through_all_tools_when_catalog_is_within_budget() -> None:
    calls: list[str] = []
    _initialize_runtime(
        mcp_client=FakeMCPClient([build_light_control_tool(calls)]),
    )

    result = asyncio.run(
        tool_selection(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "帮我打开卧室灯",
                "intent": {"name": "device_control"},
            }
        )
    )

    assert [tool["name"] for tool in result["selected_tools"]] == ["light_control"]
    assert result["execution_result"]["mode"] == "passthrough"
    assert result["execution_result"]["selected_count"] == 1


def test_tool_selection_actively_excludes_tools_when_catalog_exceeds_budget() -> None:
    calls: list[str] = []
    oversized_description = "天气查询。" * (TOOL_CATALOG_TOKEN_THRESHOLD + 100)
    _initialize_runtime(
        powerful=FakeLowCostModel(
            structured_result={
                "excluded_tool_names": ["weather_query"],
                "comment": "排除了明显无关的天气工具。",
            }
        ),
        mcp_client=FakeMCPClient(
            [
                build_light_control_tool(calls),
                build_weather_query_tool(calls, description=oversized_description),
            ]
        ),
    )

    result = asyncio.run(
        tool_selection(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "帮我打开卧室灯",
                "intent": {"name": "device_control"},
            }
        )
    )

    assert [tool["name"] for tool in result["selected_tools"]] == ["light_control"]
    assert result["execution_result"]["mode"] == "active_exclusion"
    assert result["execution_result"]["comment"] == "排除了明显无关的天气工具。"
    assert result["execution_result"]["rendered_tool_tokens"] > TOOL_CATALOG_TOKEN_THRESHOLD


def test_tool_selection_returns_empty_when_no_tools_available() -> None:
    _initialize_runtime(
        low_cost=FakeLowCostModel(
            structured_result={
                "selected_tool_names": ["light_control"],
                "comment": "selected",
            }
        ),
        mcp_client=None,
    )

    result = asyncio.run(
        tool_selection(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "帮我打开卧室灯",
                "intent": {"name": "device_control"},
            }
        )
    )

    assert result["selected_tools"] == []
    assert result["execution_result"]["selected_count"] == 0


def test_agent_call_model_and_finalize_output_use_bound_chat_model() -> None:
    calls: list[str] = []
    tool = build_light_control_tool(calls)
    _initialize_runtime(powerful=FakePowerfulModel(final_message="卧室灯已打开。"))

    initial_state = {
        "messages": [SystemMessage(content="sys"), HumanMessage(content="帮我打开卧室灯")],
        "step_count": 0,
        "step_limit": 6,
    }
    first_pass = asyncio.run(agent_call_model(initial_state, tool_instances=[tool]))

    assert first_pass["step_count"] == 1
    assert first_pass["messages"][0].tool_calls[0]["name"] == "light_control"

    second_state = {
        "messages": initial_state["messages"]
        + first_pass["messages"]
        + [ToolMessage(content="已执行 light.bedroom", name="light_control", tool_call_id="call-1")],
        "step_count": 1,
        "step_limit": 6,
    }
    second_pass = asyncio.run(agent_call_model(second_state, tool_instances=[tool]))
    finalized = agent_finalize_output({"messages": second_state["messages"] + second_pass["messages"]})

    assert second_pass["messages"][0].content == "卧室灯已打开。"
    assert finalized == {"final_output": {"message": "卧室灯已打开。"}}


def test_agent_execution_retries_after_tool_error_until_final_output() -> None:
    class RetryAfterToolErrorModel:
        def bind(self, **kwargs: Any) -> _FakeBoundModel:
            _ = kwargs
            return _FakeBoundModel(self, [])

        def bind_tools(self, tools: list[BaseTool], **kwargs: Any) -> _FakeBoundModel:
            _ = kwargs
            return _FakeBoundModel(self, tools)

        async def _ainvoke(self, messages: list[BaseMessage], tools: list[BaseTool]) -> AIMessage:
            tool_messages = [msg for msg in messages if isinstance(msg, ToolMessage)]
            if not tool_messages:
                return AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": tools[0].name,
                            "args": {"entity_id": "light.bedroom"},
                            "id": "call-1",
                            "type": "tool_call",
                        }
                    ],
                )

            if tool_messages[-1].status == "error":
                return AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": tools[0].name,
                            "args": {"entity_id": "light.bedroom"},
                            "id": "call-2",
                            "type": "tool_call",
                        }
                    ],
                )

            return AIMessage(content="卧室灯已打开。")

    call_counter = {"count": 0}

    @tool
    async def flaky_light_control(entity_id: str) -> str:
        """Fail once and then succeed."""
        call_counter["count"] += 1
        if call_counter["count"] == 1:
            raise RuntimeError("temporary network error")
        return f"已执行 {entity_id}"

    _initialize_runtime(powerful=RetryAfterToolErrorModel())

    app = compile_agent_execution_subgraph(
        selected_tools=[{"name": "flaky_light_control", "description": "", "args_schema": {}}],
        tool_instances=[flaky_light_control],
    )

    result = asyncio.run(
        app.ainvoke(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "帮我打开卧室灯",
                "intent": {"name": "device_control"},
                "metadata": {},
            }
        )
    )

    patch = result["outer_state_patch"]
    assert call_counter["count"] == 2
    assert patch["status"] == "completed"
    assert patch["execution_result"]["type"] == "agent_final_output"
    assert patch["execution_result"]["message"] == "卧室灯已打开。"
