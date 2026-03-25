from __future__ import annotations

import asyncio
import importlib

from graph.entry import initialize_request
from graph.nodes import direct_response as direct_response_function
from graph.nodes import intent_recognition as intent_recognition_function


direct_response_module = importlib.import_module("graph.nodes.direct_response")
intent_recognition_module = importlib.import_module("graph.nodes.intent_recognition")


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
