from __future__ import annotations

import asyncio
import importlib
import json

from graph.entry import initialize_request
from graph.nodes import direct_response as direct_response_function
from graph.nodes import intent_recognition as intent_recognition_function
from graph.nodes import tool_selection as tool_selection_function


direct_response_module = importlib.import_module("graph.nodes.direct_response")
intent_recognition_module = importlib.import_module("graph.nodes.intent_recognition")
tool_selection_module = importlib.import_module("graph.nodes.tool_selection")


class RecordingProvider:
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    async def complete_text(self, messages, *, temperature=0.2, json_mode=False):
        self.calls.append(
            {
                "messages": messages,
                "temperature": temperature,
                "json_mode": json_mode,
            }
        )
        return self.response


class FakeToolDescriptor:
    def __init__(self, name: str, description: str, args_schema: dict[str, object]) -> None:
        self.name = name
        self.description = description
        self.args_schema = args_schema

    def model_dump(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "args_schema": self.args_schema,
        }


class FakeToolService:
    def __init__(self, descriptors: list[FakeToolDescriptor]) -> None:
        self.descriptors = descriptors

    async def describe_tools(self) -> list[FakeToolDescriptor]:
        return self.descriptors


def test_initialize_request_uses_user_input_as_fallback_conversation_text() -> None:
    result = initialize_request({"user_input": "你好"})

    assert result["user_input"] == "你好"
    assert result["conversation_text"] == "你好"


def test_direct_response_prefers_conversation_text(monkeypatch) -> None:
    provider = RecordingProvider("简短回复")
    monkeypatch.setattr(direct_response_module, "_get_low_cost_provider", lambda: provider)

    state = {
        "user_input": "最后一句",
        "conversation_text": "user: 第一轮\nassistant: 第二轮\n\nCurrent user input:\n最后一句",
        "intent": {"name": "chat"},
    }
    result = asyncio.run(direct_response_function(state))

    assert result["execution_result"]["message"] == "简短回复"
    assert provider.calls[0]["messages"][1]["content"] == state["conversation_text"]


def test_intent_recognition_prefers_conversation_text(monkeypatch) -> None:
    provider = RecordingProvider('{"intent_name":"chat","need_tool_call":false}')
    monkeypatch.setattr(intent_recognition_module, "_get_low_cost_provider", lambda: provider)

    class FakeParser:
        def __init__(self, llm_provider):
            assert llm_provider is provider

        async def __call__(self, raw_output, schema):
            assert raw_output
            assert schema["required"] == ["intent_name", "need_tool_call"]
            return {"intent_name": "chat", "need_tool_call": False}

    monkeypatch.setattr(intent_recognition_module, "JsonParserWithRepair", FakeParser)

    state = {
        "user_input": "最后一句",
        "conversation_text": "user: 你好\nassistant: 在的\n\nCurrent user input:\n最后一句",
    }
    result = asyncio.run(intent_recognition_function(state))

    assert result["next_action"] == "direct_response"
    assert state["conversation_text"] in provider.calls[0]["messages"][1]["content"]


def test_tool_selection_prefers_conversation_text_and_selects_tools(monkeypatch) -> None:
    provider = RecordingProvider(
        '{"selected_tool_names":["weather_lookup","calendar_lookup"],"comment":"weather and schedule"}'
    )
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(
        tool_selection_module,
        "_get_tool_service",
        lambda: FakeToolService(
            [
                FakeToolDescriptor("weather_lookup", "查询天气", {"query": {"type": "string"}}),
                FakeToolDescriptor("calendar_lookup", "查询日历", {"query": {"type": "string"}}),
                FakeToolDescriptor("news_lookup", "查询新闻", {"query": {"type": "string"}}),
            ]
        ),
    )

    state = {
        "user_input": "最后一句",
        "conversation_text": "user: 帮我看看今天安排和天气\nassistant: 好的\n\nCurrent user input:\n最后一句",
        "intent": {"name": "information_query"},
    }
    result = asyncio.run(tool_selection_function(state))

    assert provider.calls[0]["json_mode"] is True
    assert provider.calls[0]["temperature"] == 0
    payload = json.loads(provider.calls[0]["messages"][1]["content"])
    assert payload["user_input"] == state["conversation_text"]
    assert len(result["candidate_tools"]) == 3
    assert [tool["name"] for tool in result["selected_tools"]] == [
        "weather_lookup",
        "calendar_lookup",
    ]
    assert result["execution_result"]["type"] == "tool_selection"
    assert result["execution_result"]["comment"] == "weather and schedule"


def test_tool_selection_logs_to_stderr_when_llm_returns_zero_tools(
    monkeypatch, capsys
) -> None:
    provider = RecordingProvider('{"selected_tool_names":[],"comment":"no relevant tool"}')
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(
        tool_selection_module,
        "_get_tool_service",
        lambda: FakeToolService(
            [FakeToolDescriptor("weather_lookup", "查询天气", {"query": {"type": "string"}})]
        ),
    )

    result = asyncio.run(tool_selection_function({"user_input": "随便聊聊", "intent": {"name": "chat"}}))
    captured = capsys.readouterr()

    assert result["selected_tools"] == []
    assert result["execution_result"]["comment"] == "no relevant tool"
    assert "no tools selected" in captured.err
    assert "no relevant tool" in captured.err


def test_tool_selection_filters_unknown_names_and_deduplicates(monkeypatch, capsys) -> None:
    provider = RecordingProvider(
        '{"selected_tool_names":["ghost_tool","weather_lookup","weather_lookup"],"comment":"best effort"}'
    )
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(
        tool_selection_module,
        "_get_tool_service",
        lambda: FakeToolService(
            [FakeToolDescriptor("weather_lookup", "查询天气", {"query": {"type": "string"}})]
        ),
    )

    result = asyncio.run(tool_selection_function({"user_input": "查天气", "intent": {"name": "info"}}))
    captured = capsys.readouterr()

    assert [tool["name"] for tool in result["selected_tools"]] == ["weather_lookup"]
    assert captured.err == ""


def test_tool_selection_truncates_to_three_tools(monkeypatch) -> None:
    provider = RecordingProvider(
        (
            '{"selected_tool_names":["tool_1","tool_2","tool_3","tool_4"],'
            '"comment":"pick the first three"}'
        )
    )
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(
        tool_selection_module,
        "_get_tool_service",
        lambda: FakeToolService(
            [
                FakeToolDescriptor("tool_1", "d1", {}),
                FakeToolDescriptor("tool_2", "d2", {}),
                FakeToolDescriptor("tool_3", "d3", {}),
                FakeToolDescriptor("tool_4", "d4", {}),
            ]
        ),
    )

    class FakeParser:
        def __init__(self, llm_provider):
            assert llm_provider is provider

        async def __call__(self, raw_output, schema):
            assert schema["properties"]["selected_tool_names"]["maxItems"] == 3
            return {
                "selected_tool_names": ["tool_1", "tool_2", "tool_3", "tool_4"],
                "comment": "pick the first three",
            }

    monkeypatch.setattr(tool_selection_module, "JsonParserWithRepair", FakeParser)

    result = asyncio.run(
        tool_selection_function({"user_input": "执行多个工具", "intent": {"name": "task"}})
    )

    assert [tool["name"] for tool in result["selected_tools"]] == ["tool_1", "tool_2", "tool_3"]


def test_tool_selection_logs_when_no_candidate_tools(monkeypatch, capsys) -> None:
    provider = RecordingProvider('{"selected_tool_names":["weather_lookup"],"comment":"unused"}')
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(tool_selection_module, "_get_tool_service", lambda: FakeToolService([]))

    result = asyncio.run(
        tool_selection_function({"user_input": "帮我开灯", "intent": {"name": "device_control"}})
    )
    captured = capsys.readouterr()

    assert result["candidate_tools"] == []
    assert result["selected_tools"] == []
    assert result["execution_result"]["comment"] == "No MCP tools are available for this request."
    assert provider.calls == []
    assert "no tools selected" in captured.err
