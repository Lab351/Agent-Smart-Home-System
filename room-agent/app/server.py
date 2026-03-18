"""Async service entrypoint for the RoomAgent runtime."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from dataclasses import dataclass

import uvicorn

if __package__ in {None, ""}:
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parent))
    from a2a_server import build_a2a_application
    from config.settings import Settings, load_settings
    from integrations.llm_provider import LLMProviderRegistry, create_llm_provider_registry
else:
    from .a2a_server import build_a2a_application
    from config.settings import Settings, load_settings
    from integrations.llm_provider import LLMProviderRegistry, create_llm_provider_registry


logger = logging.getLogger(__name__)
_SETTINGS: Settings | None = None
_LLM_PROVIDER_REGISTRY: LLMProviderRegistry | None = None


def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    global _SETTINGS
    if _SETTINGS is None:
        config_path = os.getenv("ROOM_AGENT_CONFIG_PATH")
        llm_config_path = os.getenv("ROOM_AGENT_LLM_CONFIG_PATH")
        _SETTINGS = load_settings(config_path=config_path, llm_config_path=llm_config_path)
    return _SETTINGS


def get_llm_provider_registry() -> LLMProviderRegistry:
    """Return the process-wide LLM provider registry singleton."""
    global _LLM_PROVIDER_REGISTRY
    if _LLM_PROVIDER_REGISTRY is None:
        settings = get_settings()
        _LLM_PROVIDER_REGISTRY = create_llm_provider_registry(settings.llm)
    return _LLM_PROVIDER_REGISTRY


@dataclass(slots=True)
class ServiceRuntime:
    """Coordinates the long-lived tasks hosted by the RoomAgent process."""

    host: str = os.getenv("ROOM_AGENT_HOST", "127.0.0.1")
    port: int = int(os.getenv("ROOM_AGENT_PORT", "10000"))
    business_poll_interval_seconds: float = 30.0

    async def run(self) -> None:
        """Run the HTTP server loop and the business loop in one event loop."""
        settings = get_settings()
        llm_registry = get_llm_provider_registry()
        logger.info(
            "RoomAgent settings loaded for agent=%s room=%s powerful_provider=%s low_cost_provider=%s",
            settings.agent.id,
            settings.agent.room_id,
            type(llm_registry.get("powerful")).__name__ if llm_registry.get("powerful") else "None",
            type(llm_registry.get("low_cost")).__name__ if llm_registry.get("low_cost") else "None",
        )

        stop_event = asyncio.Event()
        tasks = [
            asyncio.create_task(self.run_a2a_http_server(stop_event), name="roomagent-a2a-http"),
            asyncio.create_task(self.run_business_loop(stop_event), name="roomagent-business-loop"),
        ]

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("RoomAgent runtime cancelled, stopping background tasks.")
            await self._shutdown_tasks(tasks, stop_event)
            raise
        finally:
            if any(not task.done() for task in tasks):
                await self._shutdown_tasks(tasks, stop_event)

    async def _shutdown_tasks(
        self,
        tasks: list[asyncio.Task[None]],
        stop_event: asyncio.Event,
    ) -> None:
        """Stop background tasks, preferring graceful shutdown before cancellation."""
        stop_event.set()
        _, pending = await asyncio.wait(tasks, timeout=5)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    async def run_a2a_http_server(self, stop_event: asyncio.Event) -> None:
        """Run the RoomAgent A2A HTTP service until shutdown is requested."""
        server = uvicorn.Server(
            uvicorn.Config(
                build_a2a_application(host=self.host, port=self.port).build(),
                host=self.host,
                port=self.port,
                log_level="info",
            )
        )
        server_task = asyncio.create_task(server.serve(), name="roomagent-uvicorn")

        logger.info("RoomAgent A2A HTTP server started on http://%s:%s", self.host, self.port)
        try:
            await stop_event.wait()
        finally:
            server.should_exit = True
            with contextlib.suppress(asyncio.CancelledError):
                await server_task
            logger.info("RoomAgent A2A HTTP server stopped.")

    async def run_business_loop(self, stop_event: asyncio.Event) -> None:
        """Periodic business loop placeholder."""
        logger.info("Business loop placeholder started.")
        while not stop_event.is_set():
            await self.tick_business_jobs()
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=self.business_poll_interval_seconds,
                )
            except TimeoutError:
                continue
        logger.info("Business loop placeholder stopped.")

    async def tick_business_jobs(self) -> None:
        """Reserved hook for future scheduled business queries."""
        return None


async def main() -> None:
    """Module-level async entrypoint."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    await ServiceRuntime().run()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
