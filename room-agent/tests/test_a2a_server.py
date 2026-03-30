from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from a2a.server.agent_execution import RequestContext
from a2a.server.events import EventQueue
from a2a.types import Message, MessageSendParams, Part, Role, Task, TaskState, TaskStatus, TextPart
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool, tool

from app.a2a_server import RoomAgentExecutor, _build_conversation_text, build_agent_card
from app.server import initialize_runtime_dependencies
from config.settings import LLMRole


class FakeRegistry:
    def __init__(self, *, powerful: Any, low_cost: Any) -> None:
        self._providers = {
            LLMRole.POWERFUL: powerful,
            LLMRole.LOW_COST: low_cost,
        }

    def get(self, role: LLMRole) -> Any:
        return self._providers.get(role)


class FakeLowCostProvider:
    def __init__(self, *, need_tool_call: bool = False) -> None:
        self.need_tool_call = need_tool_call

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
        return "你好，我在。"

    async def invoke_messages(
        self,
        messages: list[BaseMessage],
        *,
        temperature: float | None = None,
        tools: Sequence[BaseTool] | None = None,
    ) -> AIMessage:
        _ = (messages, temperature, tools)
        raise AssertionError("A2A smoke should not use low-cost message-native invocation.")

    def bind_tools(
        self,
        tools: Sequence[BaseTool],
        *,
        temperature: float | None = None,
    ) -> Any:
        _ = (tools, temperature)
        raise AssertionError("A2A smoke should not bind tools on the low-cost provider.")


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
        final_message: str = "ignored",
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
        raise AssertionError("A2A smoke should not use powerful complete_text.")

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
            return AIMessage(content=self.final_message)
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": getattr(tools[0], "name", "tool"),
                    "args": self.tool_args,
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        )


class FakeMCPClient:
    def __init__(self, tools: list[BaseTool]) -> None:
        self._tools = tools

    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]:
        _ = server_name
        return self._tools

    async def list_prompts(self, server_name: str) -> dict[str, Any]:
        _ = server_name
        return {"prompts": []}


def _message(
    text: str,
    *,
    role: Role,
    task_id: str = "task-1",
    context_id: str = "ctx-1",
) -> Message:
    return Message(
        role=role,
        message_id=str(uuid4()),
        task_id=task_id,
        context_id=context_id,
        parts=[Part(root=TextPart(text=text))],
    )


def build_light_control_tool(calls: list[str]) -> BaseTool:
    @tool
    async def light_control(entity_id: str) -> str:
        """Control the bedroom light."""
        calls.append(entity_id)
        return f"已执行 {entity_id}"

    return light_control


def test_build_conversation_text_renders_history_and_current_input() -> None:
    history = [
        _message("你好", role=Role.user),
        _message("你好，我在。", role=Role.agent),
        _message("帮我打开卧室灯", role=Role.user),
    ]
    task = Task(
        id="task-1",
        context_id="ctx-1",
        status=TaskStatus(state=TaskState.submitted),
        history=history,
    )

    conversation_text = _build_conversation_text(
        task=task,
        current_message=history[-1],
    )

    assert "user: 你好" in conversation_text
    assert "assistant: 你好，我在。" in conversation_text
    assert "Current user input:\n帮我打开卧室灯" in conversation_text


def test_build_agent_card_exposes_roomagent_business_capabilities() -> None:
    agent_card = build_agent_card(host="127.0.0.1", port=10000)

    assert "placeholder" not in agent_card.description.lower()
    assert "skeleton" not in agent_card.description.lower()
    assert "查询" in agent_card.description
    assert "修改" in agent_card.description
    assert "自动化规则" in agent_card.description
    assert len(agent_card.skills) == 1
    assert agent_card.skills[0].id == "home_device_control_and_automation"
    assert "状态" in agent_card.skills[0].description
    assert "自动化规则" in agent_card.skills[0].description
    assert "placeholder" not in {tag.lower() for tag in agent_card.skills[0].tags}


def test_a2a_smoke_completes_request_end_to_end() -> None:
    initialize_runtime_dependencies(
        settings=object(),
        llm_provider_registry=FakeRegistry(
            powerful=FakePowerfulProvider(),
            low_cost=FakeLowCostProvider(),
        ),
        mcp_client=None,
    )

    executor = RoomAgentExecutor()
    request_message = _message("你好", role=Role.user)
    context = RequestContext(request=MessageSendParams(message=request_message))
    event_queue = EventQueue()

    async def _run() -> list[Any]:
        await executor.execute(context, event_queue)
        events: list[Any] = []
        while True:
            try:
                events.append(await event_queue.dequeue_event(no_wait=True))
            except asyncio.QueueEmpty:
                return events

    events = asyncio.run(_run())

    assert len(events) == 3
    assert events[0].status.state == TaskState.submitted
    assert events[1].status.state == TaskState.working
    assert events[2].status.state == TaskState.completed
    assert events[2].status.message.parts[0].root.text == "你好，我在。"


def test_a2a_tool_smoke_emits_tool_status_updates() -> None:
    tool_calls: list[str] = []
    initialize_runtime_dependencies(
        settings=object(),
        llm_provider_registry=FakeRegistry(
            powerful=FakePowerfulProvider(final_message="卧室灯已打开。"),
            low_cost=FakeLowCostProvider(need_tool_call=True),
        ),
        mcp_client=FakeMCPClient([build_light_control_tool(tool_calls)]),
    )

    executor = RoomAgentExecutor()
    request_message = _message("帮我打开卧室灯", role=Role.user)
    context = RequestContext(request=MessageSendParams(message=request_message))
    event_queue = EventQueue()

    async def _run() -> list[Any]:
        await executor.execute(context, event_queue)
        events: list[Any] = []
        while True:
            try:
                events.append(await event_queue.dequeue_event(no_wait=True))
            except asyncio.QueueEmpty:
                return events

    events = asyncio.run(_run())
    texts = [
        event.status.message.parts[0].root.text
        for event in events[1:]
        if getattr(event.status, "message", None) is not None
    ]

    assert tool_calls == ["light.bedroom"]
    assert events[1].status.state == TaskState.working
    assert "正在执行 light_control" in texts
    assert "已执行 light_control" in texts
    assert events[-1].status.state == TaskState.completed
    assert events[-1].status.message.parts[0].root.text == "卧室灯已打开。"
