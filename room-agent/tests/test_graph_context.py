from __future__ import annotations

import asyncio
import importlib
import json

from graph.entry import initialize_request
from graph.nodes import direct_response as direct_response_function
from graph.nodes import intent_recognition as intent_recognition_function
from graph.nodes import tool_selection as tool_selection_function
from graph.subgraphs.agent_execution import agent_execution as agent_execution_function


direct_response_module = importlib.import_module("graph.nodes.direct_response")
intent_recognition_module = importlib.import_module("graph.nodes.intent_recognition")
tool_selection_module = importlib.import_module("graph.nodes.tool_selection")
agent_execution_module = importlib.import_module("graph.subgraphs.agent_execution.entry")


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


class SequenceProvider:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[dict[str, object]] = []

    async def complete_text(self, messages, *, temperature=0.2, json_mode=False):
        self.calls.append(
            {
                "messages": messages,
                "temperature": temperature,
                "json_mode": json_mode,
            }
        )
        if not self.responses:
            raise AssertionError("No more mock responses configured.")
        return self.responses.pop(0)


class FakeToolDescriptor:
    def __init__(self, name: str, description: str, args_schema: dict[str, object]) -> None:
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self.args = args_schema

    def model_dump(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "args_schema": self.args_schema,
        }


class FakeMCPClient:
    def __init__(self, descriptors: list[FakeToolDescriptor]) -> None:
        self.descriptors = descriptors

    async def get_tools(self) -> list[FakeToolDescriptor]:
        return self.descriptors


class FakeInvokableTool(FakeToolDescriptor):
    def __init__(
        self,
        name: str,
        description: str,
        args_schema: dict[str, object],
        *,
        result: object | None = None,
        error: Exception | None = None,
    ) -> None:
        super().__init__(name, description, args_schema)
        self.result = result
        self.error = error
        self.calls: list[dict[str, object]] = []

    async def ainvoke(self, args: dict[str, object]) -> object:
        self.calls.append(args)
        if self.error is not None:
            raise self.error
        return self.result


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
        "_get_mcp_client",
        lambda: FakeMCPClient(
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


def test_tool_selection_logs_to_stderr_when_llm_returns_zero_tools(monkeypatch, capsys) -> None:
    provider = RecordingProvider('{"selected_tool_names":[],"comment":"no relevant tool"}')
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(
        tool_selection_module,
        "_get_mcp_client",
        lambda: FakeMCPClient(
            [FakeToolDescriptor("weather_lookup", "查询天气", {"query": {"type": "string"}})]
        ),
    )

    result = asyncio.run(
        tool_selection_function({"user_input": "随便聊聊", "intent": {"name": "chat"}})
    )
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
        "_get_mcp_client",
        lambda: FakeMCPClient(
            [FakeToolDescriptor("weather_lookup", "查询天气", {"query": {"type": "string"}})]
        ),
    )

    result = asyncio.run(
        tool_selection_function({"user_input": "查天气", "intent": {"name": "info"}})
    )
    captured = capsys.readouterr()

    assert [tool["name"] for tool in result["selected_tools"]] == ["weather_lookup"]
    assert captured.err == ""


def test_tool_selection_logs_when_no_candidate_tools(monkeypatch, capsys) -> None:
    provider = RecordingProvider('{"selected_tool_names":["weather_lookup"],"comment":"unused"}')
    monkeypatch.setattr(tool_selection_module, "_get_low_cost_provider", lambda: provider)
    monkeypatch.setattr(tool_selection_module, "_get_mcp_client", lambda: FakeMCPClient([]))

    result = asyncio.run(
        tool_selection_function({"user_input": "帮我开灯", "intent": {"name": "device_control"}})
    )
    captured = capsys.readouterr()

    assert result["candidate_tools"] == []
    assert result["selected_tools"] == []
    assert result["execution_result"]["comment"] == "No MCP tools are available for this request."
    assert provider.calls == []
    assert "no tools selected" in captured.err


def test_agent_execution_returns_structured_final_output(monkeypatch) -> None:
    provider = SequenceProvider(
        [
            (
                '{"step_type":"final_output","is_done":true,'
                '"final_output":{"message":"已为你生成结果","summary":"done","metadata":{"source":"planner"}}}'
            )
        ]
    )
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: None)

    result = asyncio.run(
        agent_execution_function(
            {
                "user_input": "帮我开灯",
                "conversation_text": "user: 帮我开灯",
                "intent": {"name": "device_control"},
                "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
            }
        )
    )

    assert result["status"] == "completed"
    assert result["next_action"] == "agent_execution"
    assert result["execution_result"]["type"] == "agent_final_output"
    assert result["execution_result"]["message"] == "已为你生成结果"
    assert result["execution_result"]["tool_call_history"] == []
    assert "args_schema" in provider.calls[0]["messages"][0]["content"]
    planner_context = provider.calls[0]["messages"][1]["content"]
    assert "可用工具: - light_control: 控制灯光" in planner_context
    assert "args_schema: {}" in planner_context


def test_agent_execution_loops_reason_then_final_output(monkeypatch) -> None:
    provider = SequenceProvider(
        [
            '{"step_type":"reason","is_done":false,"reason_summary":"先思考一下"}',
            '{"step_type":"final_output","is_done":true,"final_output":{"message":"执行完成"}}',
        ]
    )
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: None)

    result = asyncio.run(
        agent_execution_function(
            {
                "user_input": "帮我开灯",
                "conversation_text": "user: 帮我开灯",
                "intent": {"name": "device_control"},
                "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
            }
        )
    )

    assert result["status"] == "completed"
    assert result["execution_result"]["message"] == "执行完成"
    assert len(provider.calls) == 2
    second_context = provider.calls[1]["messages"][1]["content"]
    assert "执行历史: [{'step_index': 1, 'step_type': 'reason', 'reason_summary': '先思考一下'}]" in second_context
    assert "当前步数: 1 / 最多步数: 6" in second_context


def test_agent_execution_fails_when_step_limit_is_exceeded(monkeypatch) -> None:
    provider = SequenceProvider(['{"step_type":"reason","is_done":false,"reason_summary":"继续思考"}'])
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: None)
    monkeypatch.setattr(agent_execution_module, "DEFAULT_STEP_LIMIT", 1)

    result = asyncio.run(
        agent_execution_function(
            {
                "user_input": "帮我开灯",
                "conversation_text": "user: 帮我开灯",
                "intent": {"name": "device_control"},
                "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
            }
        )
    )

    assert result["status"] == "failed"
    assert result["execution_result"]["unfinished"] is True
    assert result["execution_result"]["message"] == "任务暂时无法完成，请稍后重试。"
    assert result["error"]["type"] == "agent_step_limit_exceeded"


def test_agent_execution_records_toolcall_summary_without_raw_observation(monkeypatch) -> None:
    provider = SequenceProvider(
        [
            '{"step_type":"toolcall","is_done":false,"tool_name":"light_control","tool_args":{"entity_id":"light.bedroom"}}',
            '{"step_type":"final_output","is_done":true,"final_output":{"message":"灯已打开"}}',
        ]
    )
    tool = FakeInvokableTool(
        "light_control",
        "控制灯光",
        {"entity_id": {"type": "string"}},
        result={"ok": True, "entity_id": "light.bedroom"},
    )
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: FakeMCPClient([tool]))

    result = asyncio.run(
        agent_execution_function(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "user: 帮我打开卧室灯",
                "intent": {"name": "device_control"},
                "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
            }
        )
    )

    history_entry = result["execution_result"]["tool_call_history"][0]
    assert result["status"] == "completed"
    assert tool.calls == [{"entity_id": "light.bedroom"}]
    assert history_entry["tool_name"] == "light_control"
    assert "result_summary" in history_entry
    assert "observation" not in history_entry
    assert '"entity_id"' in provider.calls[0]["messages"][1]["content"]


def test_agent_execution_replans_once_after_tool_failure(monkeypatch) -> None:
    provider = SequenceProvider(
        [
            '{"step_type":"toolcall","is_done":false,"tool_name":"light_control","tool_args":{"entity_id":"light.one"}}',
            '{"step_type":"toolcall","is_done":false,"tool_name":"light_control","tool_args":{"entity_id":"light.two"}}',
        ]
    )
    tool = FakeInvokableTool(
        "light_control",
        "控制灯光",
        {"entity_id": {"type": "string"}},
        error=RuntimeError("ha failed"),
    )
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: FakeMCPClient([tool]))

    result = asyncio.run(
        agent_execution_function(
            {
                "user_input": "帮我打开卧室灯",
                "conversation_text": "user: 帮我打开卧室灯",
                "intent": {"name": "device_control"},
                "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
            }
        )
    )

    assert result["status"] == "failed"
    assert result["error"]["type"] == "tool_execution_error"
    assert result["execution_result"]["message"] == "任务暂时无法完成，请稍后重试。"
    assert "RuntimeError: ha failed" in result["error"]["message"]
    assert len(result["execution_result"]["tool_call_history"]) == 2
    assert tool.calls == [{"entity_id": "light.one"}, {"entity_id": "light.two"}]


def test_agent_execution_dry_run_skips_real_tool_invocation(monkeypatch, caplog) -> None:
    provider = SequenceProvider(
        [
            '{"step_type":"toolcall","is_done":false,"tool_name":"light_control","tool_args":{"entity_id":"light.bedroom"}}',
            '{"step_type":"final_output","is_done":true,"final_output":{"message":"dry run done"}}',
        ]
    )
    tool = FakeInvokableTool(
        "light_control",
        "控制灯光",
        {"entity_id": {"type": "string"}},
        result={"ok": True},
    )
    monkeypatch.setenv("RA_DRY_RUN", "1")
    monkeypatch.setattr(agent_execution_module, "_get_powerful_provider", lambda: provider)
    monkeypatch.setattr(agent_execution_module, "get_mcp_client", lambda: FakeMCPClient([tool]))

    with caplog.at_level("INFO"):
        result = asyncio.run(
            agent_execution_function(
                {
                    "user_input": "帮我打开卧室灯",
                    "conversation_text": "user: 帮我打开卧室灯",
                    "intent": {"name": "device_control"},
                    "selected_tools": [{"name": "light_control", "description": "控制灯光"}],
                }
            )
        )

    history_entry = result["execution_result"]["tool_call_history"][0]
    assert result["status"] == "completed"
    assert tool.calls == []
    assert history_entry["tool_name"] == "light_control"
    assert "RA_DRY_RUN enabled; skipped real MCP invocation." in history_entry["result_summary"]
    assert "RA_DRY_RUN intercepted MCP tool call" in caplog.text
