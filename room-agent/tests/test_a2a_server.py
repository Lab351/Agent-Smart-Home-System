from __future__ import annotations

import asyncio
from uuid import uuid4

from a2a.types import Message, Part, Role, Task, TaskState, TaskStatus, TextPart

import app.a2a_server as a2a_server
from app.a2a_server import RoomAgentExecutor, _build_conversation_text, build_agent_card


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

    conversation_text = _build_conversation_text(task=task, current_message=history[-1])

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


def test_build_agent_card_uses_public_url_when_configured() -> None:
    agent_card = build_agent_card(
        host="0.0.0.0",
        port=10000,
        public_url="http://192.168.1.20:10000",
    )

    assert agent_card.url == "http://192.168.1.20:10000/"


def test_invoke_roomagent_entrypoint_forwards_graph_input_and_returns_execution_result() -> None:
    captured: dict[str, object] = {}

    class FakeApp:
        async def ainvoke(self, state: dict[str, object]) -> dict[str, object]:
            captured.update(state)
            return {"execution_result": {"type": "text", "message": "你好，我在。"}}

    class FakeUpdater:
        def __init__(self) -> None:
            self.started = False

        async def start_work(self) -> None:
            self.started = True

    original_compile_graph = a2a_server._compile_graph
    original_updater = a2a_server._CURRENT_UPDATER
    updater = FakeUpdater()
    a2a_server._compile_graph = lambda: FakeApp()
    a2a_server._CURRENT_UPDATER = updater

    try:
        result = asyncio.run(
            RoomAgentExecutor().invoke_roomagent_entrypoint(
                user_input="你好",
                context_id="ctx-1",
                task_id="task-1",
                conversation_text="Conversation transcript:\nuser: 你好",
            )
        )
    finally:
        a2a_server._compile_graph = original_compile_graph
        a2a_server._CURRENT_UPDATER = original_updater

    assert updater.started is True
    assert result == {"type": "text", "message": "你好，我在。"}
    assert captured["user_input"] == "你好"
    assert captured["conversation_text"] == "Conversation transcript:\nuser: 你好"
    assert captured["metadata"] == {
        "context_id": "ctx-1",
        "task_id": "task-1",
        "source": "a2a",
    }


def test_invoke_roomagent_entrypoint_returns_empty_dict_for_non_dict_execution_result() -> None:
    class FakeApp:
        async def ainvoke(self, state: dict[str, object]) -> dict[str, object]:
            _ = state
            return {"execution_result": "not-a-dict"}

    class FakeUpdater:
        async def start_work(self) -> None:
            return None

    original_compile_graph = a2a_server._compile_graph
    original_updater = a2a_server._CURRENT_UPDATER
    a2a_server._compile_graph = lambda: FakeApp()
    a2a_server._CURRENT_UPDATER = FakeUpdater()

    try:
        result = asyncio.run(
            RoomAgentExecutor().invoke_roomagent_entrypoint(
                user_input="你好",
                context_id="ctx-1",
                task_id="task-1",
            )
        )
    finally:
        a2a_server._compile_graph = original_compile_graph
        a2a_server._CURRENT_UPDATER = original_updater

    assert result == {}
