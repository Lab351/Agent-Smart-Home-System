from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool

from app.server import initialize_runtime_dependencies
from config.settings import LLMRole
from graph.entry import compile_graph
from graph.subgraphs.sasha_verification import compile_sasha_verification_subgraph, sasha_verification


class FakeRegistry:
    def __init__(self, *, powerful: Any = None, low_cost: Any = None) -> None:
        self._providers = {
            LLMRole.POWERFUL: powerful,
            LLMRole.LOW_COST: low_cost,
        }

    def get(self, role: LLMRole, *, enable_thinking: bool = False) -> Any:
        _ = enable_thinking
        return self._providers.get(role)


class FakePromptMCPClient:
    def __init__(self, *, tools: list[BaseTool] | None = None, prompt_text: str = "vendor prompt") -> None:
        self._tools = tools or []
        self._prompt_text = prompt_text

    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]:
        _ = server_name
        return self._tools

    async def list_prompts(self, server_name: str) -> dict[str, Any]:
        _ = server_name
        return {
            "prompts": [
                {
                    "name": "vendor_prompt",
                    "description": "Home Assistant vendor prompt",
                    "arguments": [],
                }
            ]
        }

    async def get_prompt(self, server_name: str, prompt_name: str) -> dict[str, Any]:
        _ = (server_name, prompt_name)
        return {
            "messages": [
                {
                    "role": "system",
                    "content": {
                        "type": "text",
                        "text": self._prompt_text,
                    },
                }
            ]
        }


class _BoundTextRunnable:
    def __init__(self, model: "SequentialTextModel") -> None:
        self._model = model

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        return await self._model.ainvoke(messages)


class SequentialTextModel:
    def __init__(self, outputs: list[str]) -> None:
        self._outputs = list(outputs)
        self.calls: list[list[BaseMessage]] = []

    def bind(self, **kwargs: Any) -> _BoundTextRunnable:
        _ = kwargs
        return _BoundTextRunnable(self)

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        self.calls.append(messages)
        if not self._outputs:
            raise AssertionError("No more text outputs configured.")
        return AIMessage(content=self._outputs.pop(0))


class _StructuredRunnable:
    def __init__(self, model: "IntegratedGraphModel") -> None:
        self._model = model

    def bind(self, **kwargs: Any) -> "_StructuredRunnable":
        _ = kwargs
        return self

    async def ainvoke(self, messages: list[BaseMessage]) -> dict[str, Any]:
        self._model.tool_selection_messages.append(messages)
        return {
            "excluded_tool_names": [],
            "comment": "keep all tools",
        }


class _AgentRunnable:
    def __init__(self, model: "IntegratedGraphModel") -> None:
        self._model = model

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        self._model.agent_execution_messages.append(messages)
        return AIMessage(content="执行完成。")


class IntegratedGraphModel:
    def __init__(self) -> None:
        self.sasha_messages: list[list[BaseMessage]] = []
        self.tool_selection_messages: list[list[BaseMessage]] = []
        self.agent_execution_messages: list[list[BaseMessage]] = []
        self._sasha_outputs = [
            "clarifying result",
            "filtering result",
            "planning result",
        ]

    def bind(self, **kwargs: Any) -> _BoundTextRunnable:
        _ = kwargs
        return _BoundTextRunnable(self)

    def with_structured_output(
        self,
        schema: dict[str, Any] | None = None,
        *,
        method: str = "json_schema",
        include_raw: bool = False,
        strict: bool | None = None,
        tools: list[Any] | None = None,
        **kwargs: Any,
    ) -> _StructuredRunnable:
        _ = (schema, method, include_raw, strict, tools, kwargs)
        return _StructuredRunnable(self)

    def bind_tools(self, tools: list[BaseTool], **kwargs: Any) -> _AgentRunnable:
        _ = (tools, kwargs)
        return _AgentRunnable(self)

    async def ainvoke(self, messages: list[BaseMessage]) -> AIMessage:
        self.sasha_messages.append(messages)
        if not self._sasha_outputs:
            raise AssertionError("Unexpected extra text-model invocation.")
        return AIMessage(content=self._sasha_outputs.pop(0))


def _initialize_runtime(
    *,
    powerful: Any,
    mcp_client: Any = None,
    server_name: str | None = "ha",
) -> None:
    initialize_runtime_dependencies(
        settings=SimpleNamespace(
            agent=SimpleNamespace(
                home_assistant_mcp=SimpleNamespace(server_name=server_name),
            )
        ),
        llm_provider_registry=FakeRegistry(powerful=powerful, low_cost=None),
        mcp_client=mcp_client,
    )


def _build_light_tool(*, description: str = "Control light.") -> BaseTool:
    @tool(description=description)
    async def light_control(entity_id: str) -> str:
        return f"已执行 {entity_id}"

    return light_control


def test_sasha_verification_returns_empty_patch_when_disabled(monkeypatch) -> None:
    monkeypatch.delenv("__RA_SASHA_VER", raising=False)

    result = asyncio.run(
        sasha_verification(
            {
                "user_input": "帮我打开灯",
                "conversation_text": "帮我打开灯",
            }
        )
    )

    assert result == {}


def test_main_graph_consumes_patched_conversation_text_when_sasha_enabled(monkeypatch) -> None:
    monkeypatch.setenv("__RA_SASHA_VER", "on")
    oversized_description = "灯光控制。" * 20000
    model = IntegratedGraphModel()
    _initialize_runtime(
        powerful=model,
        mcp_client=FakePromptMCPClient(
            tools=[_build_light_tool(description=oversized_description)],
            prompt_text="use vendor names",
        ),
    )

    app = compile_graph()
    result = asyncio.run(
        app.ainvoke(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "帮我打开卧室灯",
                "metadata": {},
            }
        )
    )

    assert result["execution_result"]["message"] == "执行完成。"
    assert len(model.tool_selection_messages) == 1
    assert len(model.agent_execution_messages) == 1

    tool_selection_payload = model.tool_selection_messages[0][1].content
    assert "Planning result:" in tool_selection_payload
    assert "planning result" in tool_selection_payload

    agent_system_message = model.agent_execution_messages[0][0]
    assert isinstance(agent_system_message, SystemMessage)
    assert "智能家居执行助手" in agent_system_message.content
    assert "Filtered context:\nfiltering result" in agent_system_message.content
    assert "不重新发散推理" in agent_system_message.content
    assert "当用户未明确下达设备指令" not in agent_system_message.content

    agent_human_message = model.agent_execution_messages[0][1]
    assert isinstance(agent_human_message, HumanMessage)
    assert "Planning result:" in agent_human_message.content
    assert "planning result" in agent_human_message.content
