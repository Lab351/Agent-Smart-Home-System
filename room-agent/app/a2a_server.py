"""A2A HTTP service building blocks for the RoomAgent runtime."""

from __future__ import annotations

import logging

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
    TaskState,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import new_task
from a2a.utils.errors import ServerError


logger = logging.getLogger(__name__)
SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]
A2A_FALLBACK_RESPONSE = "RoomAgent 已收到请求，当前返回仍为最简占位结果。"


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
        user_input = context.get_user_input()
        logger.info("Received RoomAgent A2A request: %s", user_input)

        result = await self.invoke_roomagent_entrypoint(
            user_input=user_input,
            context_id=task.context_id,
            task_id=task.id,
            conversation_text=_build_conversation_text(
                task=task,
                current_message=context.message,
            ),
        )
        result = result or A2A_FALLBACK_RESPONSE

        await updater.add_artifact(
            [Part(root=TextPart(text=result))],
            name="room_agent_response",
        )
        await updater.complete()

    async def invoke_roomagent_entrypoint(
        self,
        *,
        user_input: str,
        context_id: str,
        task_id: str,
        conversation_text: str | None = None,
    ) -> str:
        """Invoke the RoomAgent LangGraph entrypoint and return a minimal text result."""
        app = _compile_graph()
        final_state = await app.ainvoke(
            {
                "user_input": user_input,
                "conversation_text": (conversation_text or user_input).strip() or user_input,
                "metadata": {
                    "context_id": context_id,
                    "task_id": task_id,
                    "source": "a2a",
                },
            }
        )
        execution_result = final_state.get("execution_result", {})
        message = execution_result.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        return A2A_FALLBACK_RESPONSE

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
    if current_message and (
        not history or history[-1].message_id != current_message.message_id
    ):
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


def build_a2a_application(*, host: str, port: int) -> A2AStarletteApplication:
    """Create the RoomAgent A2A Starlette application."""
    request_handler = DefaultRequestHandler(
        agent_executor=RoomAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(
        agent_card=build_agent_card(host=host, port=port),
        http_handler=request_handler,
    )


def build_agent_card(*, host: str, port: int) -> AgentCard:
    """Create a blank RoomAgent agent card placeholder."""
    return AgentCard(
        name="RoomAgent",
        description="Blank RoomAgent A2A service skeleton awaiting skill and executor wiring.",
        url=f"http://{host}:{port}/",
        version="0.1.0",
        default_input_modes=SUPPORTED_CONTENT_TYPES,
        default_output_modes=SUPPORTED_CONTENT_TYPES,
        capabilities=AgentCapabilities(streaming=False, push_notifications=False),
        skills=[
            AgentSkill(
                id="room_agent_placeholder",
                name="RoomAgent Placeholder",
                description="Placeholder skill card to be completed later.",
                tags=["placeholder"],
                input_modes=SUPPORTED_CONTENT_TYPES,
                output_modes=SUPPORTED_CONTENT_TYPES,
            )
        ],
    )
