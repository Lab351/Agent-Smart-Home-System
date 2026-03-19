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
    Part,
    TaskState,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import new_agent_text_message, new_task
from a2a.utils.errors import ServerError


logger = logging.getLogger(__name__)
SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]


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
        )

        if result is None:
            await updater.update_status(
                TaskState.input_required,
                new_agent_text_message(
                    "RoomAgent A2A executor placeholder is ready, but the LangChain entrypoint is not wired yet.",
                    task.context_id,
                    task.id,
                ),
                final=True,
            )
            return

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
    ) -> str | None:
        """Reserved hook for the future LangChain/LangGraph execution entrypoint."""
        _ = (user_input, context_id, task_id)
        return None

    async def cancel(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        _ = (context, event_queue)
        raise ServerError(error=UnsupportedOperationError())


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
