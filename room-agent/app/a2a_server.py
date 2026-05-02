"""A2A HTTP service building blocks for the RoomAgent runtime."""

from __future__ import annotations

import logging
from typing import Any

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    Message,
    Part,
    Task,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import new_task
from a2a.utils.errors import ServerError

logger = logging.getLogger(__name__)
SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]
A2A_FALLBACK_RESPONSE = "RoomAgent 已收到请求，当前返回仍为最简占位结果。"

_CURRENT_UPDATER: TaskUpdater | None = None


def get_current_updater() -> TaskUpdater:
    """Get the current TaskUpdater for the executing task, if available."""
    global _CURRENT_UPDATER
    if _CURRENT_UPDATER is None:
        raise RuntimeError("No current TaskUpdater available")
    return _CURRENT_UPDATER


def create_text_part(text: str) -> Part:
    """Helper function to create a text Part."""
    return Part(root=TextPart(text=text.strip()))


class RoomAgentExecutor(AgentExecutor):
    """Minimal A2A executor skeleton for the RoomAgent service."""

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        task = context.current_task
        if not task:
            task = new_task(context.message)
            await event_queue.enqueue_event(task)

        updater = TaskUpdater(event_queue, task.id, task.context_id)
        global _CURRENT_UPDATER
        _CURRENT_UPDATER = updater

        user_input = context.get_user_input()
        logger.info("Received RoomAgent A2A request: %s", user_input)

        try:
            execution_result = await self.invoke_roomagent_entrypoint(
                user_input=user_input,
                context_id=task.context_id,
                task_id=task.id,
                conversation_text=_build_conversation_text(
                    task=task,
                    current_message=context.message,
                ),
            )
            if isinstance(execution_result, dict) and execution_result.get("unfinished"):
                logger.warning(
                    "RoomAgent A2A task finished unfinished task_id=%s context_id=%s",
                    task.id,
                    task.context_id,
                )
        except Exception:
            raise
        finally:
            _CURRENT_UPDATER = None

    async def invoke_roomagent_entrypoint(
        self,
        *,
        user_input: str,
        context_id: str,
        task_id: str,
        conversation_text: str | None = None,
    ) -> dict[str, Any]:
        """Invoke the RoomAgent LangGraph entrypoint and return execution_result."""
        app = _compile_graph()

        updater = get_current_updater()
        await updater.start_work()

        final_state = await app.ainvoke(
            {
                "user_input": user_input,
                "conversation_text": (conversation_text or user_input).strip() or user_input,
                "metadata": (
                    {
                        "context_id": context_id,
                        "task_id": task_id,
                        "source": "a2a",
                    }
                ),
            }
        )

        # logger.info(
        #     "RoomAgent graph final state task_id=%s context_id=%s state=%s",
        #     task_id,
        #     context_id,
        #     json.dumps(final_state, ensure_ascii=False, default=str),
        # )
        execution_result = final_state.get("execution_result", {})
        if isinstance(execution_result, dict):
            return execution_result
        return {}

    async def cancel(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        _ = (context, event_queue)
        raise ServerError(error=UnsupportedOperationError())


def _build_conversation_text(
    *,
    task: Task | None,
    current_message: Message | None,
) -> str:
    history = list(task.history or []) if task and task.history else []
    if current_message and (not history or history[-1].message_id != current_message.message_id):
        history.append(current_message)

    transcript_lines: list[str] = []
    for message in history:
        text = _extract_text_from_message(message)
        if not text:
            continue
        transcript_lines.append(f"{_normalize_role(message.role)}: {text}")

    current_user_input = _extract_text_from_message(current_message)
    if not current_user_input and history:
        for message in reversed(history):
            if _normalize_role(message.role) == "user":
                current_user_input = _extract_text_from_message(message)
                if current_user_input:
                    break

    if not transcript_lines:
        return current_user_input

    if not current_user_input:
        return "Conversation transcript:\n" + "\n".join(transcript_lines)

    return (
        "Conversation transcript:\n"
        + "\n".join(transcript_lines)
        + "\n\nCurrent user input:\n"
        + current_user_input
    )


def _extract_text_from_message(message: Message | None) -> str:
    if message is None:
        return ""

    parts = []
    for part in message.parts:
        if isinstance(part.root, TextPart):
            text = part.root.text.strip()
            if text:
                parts.append(text)
    return "\n".join(parts)


def _normalize_role(role: object) -> str:
    value = getattr(role, "value", role)
    if value == "agent":
        return "assistant"
    if value == "user":
        return "user"
    return str(value)


def _compile_graph():
    from graph.entry import compile_graph

    return compile_graph()


def build_a2a_application(
    *,
    host: str,
    port: int,
    public_url: str | None = None,
) -> A2AStarletteApplication:
    """Create the RoomAgent A2A Starlette application."""
    request_handler = DefaultRequestHandler(
        agent_executor=RoomAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(
        agent_card=build_agent_card(host=host, port=port, public_url=public_url),
        http_handler=request_handler,
    )


def build_agent_card(*, host: str, port: int, public_url: str | None = None) -> AgentCard:
    """Create the RoomAgent agent card for A2A discovery."""
    return AgentCard(
        name="RoomAgent",
        description="负责查询和修改家居终端状态，并可安排房间级自动化规则的 RoomAgent A2A 服务。",
        url=_normalize_public_url(public_url) or f"http://{host}:{port}/",
        version="0.1.0",
        default_input_modes=SUPPORTED_CONTENT_TYPES,
        default_output_modes=SUPPORTED_CONTENT_TYPES,
        capabilities=AgentCapabilities(streaming=True, push_notifications=False),
        skills=[
            AgentSkill(
                id="home_device_control_and_automation",
                name="家居状态控制与自动化",
                description="查询家居终端状态、执行状态修改，并安排房间级自动化规则。",
                tags=["device_control", "state_query", "automation"],
                input_modes=SUPPORTED_CONTENT_TYPES,
                output_modes=SUPPORTED_CONTENT_TYPES,
            )
        ],
    )


def _normalize_public_url(public_url: str | None) -> str | None:
    if not public_url:
        return None

    stripped = public_url.strip()
    if not stripped:
        return None

    return stripped.rstrip("/") + "/"
