from __future__ import annotations

import asyncio
from uuid import uuid4
from unittest.mock import Mock

from a2a.server.agent_execution import RequestContext
from a2a.server.events import EventQueue
from a2a.types import Message, MessageSendParams, Part, Role, Task, TaskState, TaskStatus, TextPart

from app.a2a_server import A2A_FALLBACK_RESPONSE, RoomAgentExecutor, _build_conversation_text


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

    conversation_text = _build_conversation_text(
        task=task,
        current_message=history[-1],
    )

    assert "user: 你好" in conversation_text
    assert "assistant: 你好，我在。" in conversation_text
    assert "user: 帮我打开卧室灯" in conversation_text
    assert "Current user input:\n帮我打开卧室灯" in conversation_text


def test_invoke_roomagent_entrypoint_falls_back_when_graph_message_missing(
    monkeypatch,
) -> None:
    executor = RoomAgentExecutor()
    logger = Mock()

    class FakeGraph:
        async def ainvoke(self, payload):
            assert payload["conversation_text"] == "user: 你好"
            return {"execution_result": {"type": "placeholder"}}

    monkeypatch.setattr("app.a2a_server._compile_graph", lambda: FakeGraph())
    monkeypatch.setattr("app.a2a_server.logger", logger)

    result = asyncio.run(
        executor.invoke_roomagent_entrypoint(
            user_input="你好",
            context_id="ctx-1",
            task_id="task-1",
            conversation_text="user: 你好",
        )
    )

    assert result == A2A_FALLBACK_RESPONSE
    logger.info.assert_called_once()
    assert '"type": "placeholder"' in logger.info.call_args.args[3]


def test_execute_enqueues_artifact_for_new_task(monkeypatch) -> None:
    executor = RoomAgentExecutor()
    request_message = _message("你好", role=Role.user)
    context = RequestContext(request=MessageSendParams(message=request_message))
    event_queue = EventQueue()

    async def fake_invoke_roomagent_entrypoint(**kwargs):
        assert kwargs["user_input"] == "你好"
        assert "Current user input:\n你好" in kwargs["conversation_text"]
        return "graph reply"

    monkeypatch.setattr(
        executor,
        "invoke_roomagent_entrypoint",
        fake_invoke_roomagent_entrypoint,
    )

    async def _run() -> list[object]:
        await executor.execute(context, event_queue)
        events: list[object] = []
        while True:
            try:
                events.append(await event_queue.dequeue_event(no_wait=True))
            except asyncio.QueueEmpty:
                return events

    events = asyncio.run(_run())

    assert len(events) == 3
    task_event, artifact_event, status_event = events
    assert isinstance(task_event, Task)
    assert artifact_event.artifact.parts[0].root.text == "graph reply"
    assert status_event.status.state == TaskState.completed
