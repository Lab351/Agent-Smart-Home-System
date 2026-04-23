"""Async service entrypoint for the RoomAgent runtime."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import argparse
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import uvicorn

DIRECT_EXECUTION_ERROR = (
    "Do not run room-agent/app/server.py directly. "
    "Use the project script entry instead, for example: "
    "`cd room-agent && uv run serve --config-path config/examples/room_agent.example.yaml "
    "--llm-config-path /path/to/private-llm.yaml`."
)

if __name__ == "__main__" and (__package__ is None or __package__ == ""):
    raise SystemExit(DIRECT_EXECUTION_ERROR)

from .a2a_server import build_a2a_application
from config.settings import HomeAssistantMCPSettings, LLMRole, Settings, load_settings
from .gateway_client import GatewayClient
from .public_url import PublicUrlResolutionError, resolve_agent_card_url
from integrations.mcp_client import MCPToolClient, build_home_assistant_mcp_client
from integrations.llm_provider import LLMProviderRegistry, create_llm_provider_registry


logger = logging.getLogger(__name__)
_SETTINGS: Settings | None = None
_LLM_PROVIDER_REGISTRY: LLMProviderRegistry | None = None
_MCP_CLIENT: MCPToolClient | None = None
_CONFIG_PATH: str | None = None
_LLM_CONFIG_PATH: str | None = None
ROOM_AGENT_HOST_ENV = "ROOM_AGENT_HOST"
ROOM_AGENT_PORT_ENV = "ROOM_AGENT_PORT"
DEFAULT_ROOM_AGENT_HOST = "127.0.0.1"
DEFAULT_ROOM_AGENT_PORT = 10000


@dataclass(slots=True)
class MCPHealthStatus:
    enabled: bool = False
    healthy: bool = False
    server_name: str | None = None
    checked_at: str | None = None
    prompt_count: int | None = None
    error_type: str | None = None
    error: str | None = None


_MCP_HEALTH_STATUS = MCPHealthStatus()


def initialize_runtime_dependencies(
    *,
    settings: Settings,
    llm_provider_registry: LLMProviderRegistry | None = None,
    mcp_client: MCPToolClient | None = None,
    mcp_health_status: MCPHealthStatus | None = None,
) -> None:
    """Initialize process-wide runtime singletons explicitly."""
    global _SETTINGS
    global _LLM_PROVIDER_REGISTRY
    global _MCP_CLIENT
    global _MCP_HEALTH_STATUS

    _SETTINGS = settings
    _LLM_PROVIDER_REGISTRY = llm_provider_registry or create_llm_provider_registry(settings.llm)
    _MCP_CLIENT = mcp_client
    _MCP_HEALTH_STATUS = mcp_health_status or MCPHealthStatus()


def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    global _SETTINGS
    if _SETTINGS is None:
        _SETTINGS = load_settings(config_path=_CONFIG_PATH, llm_config_path=_LLM_CONFIG_PATH)
    return _SETTINGS


def get_mcp_client() -> MCPToolClient | None:
    """Return the process-wide MCP client singleton."""
    return _MCP_CLIENT


def get_mcp_health_status() -> dict[str, object | None]:
    """Return the last known Home Assistant MCP health status."""
    return asdict(_MCP_HEALTH_STATUS)


def parse_args(
    argv: Sequence[str] | None = None,
    environ: Mapping[str, str] | None = None,
) -> argparse.Namespace:
    """Parse command-line arguments for runtime configuration."""
    env = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(description="Run RoomAgent runtime service.")
    parser.add_argument(
        "--config-path",
        dest="config_path",
        required=True,
        help="Path to room-agent main config file.",
    )
    parser.add_argument(
        "--llm-config-path",
        dest="llm_config_path",
        required=True,
        help="Path to room-agent LLM config file.",
    )
    parser.add_argument(
        "--host",
        dest="host",
        default=env.get(ROOM_AGENT_HOST_ENV, DEFAULT_ROOM_AGENT_HOST),
        help=(
            "Bind host for the A2A HTTP service. "
            f"Defaults to ${ROOM_AGENT_HOST_ENV} or {DEFAULT_ROOM_AGENT_HOST}. "
            "Use 0.0.0.0 for LAN testing."
        ),
    )
    parser.add_argument(
        "--port",
        dest="port",
        type=int,
        default=_read_port_from_env(env),
        help=(
            "Bind port for the A2A HTTP service. "
            f"Defaults to ${ROOM_AGENT_PORT_ENV} or {DEFAULT_ROOM_AGENT_PORT}."
        ),
    )
    return parser.parse_args(argv)


def _read_port_from_env(environ: Mapping[str, str]) -> int:
    value = environ.get(ROOM_AGENT_PORT_ENV)
    if value is None or not value.strip():
        return DEFAULT_ROOM_AGENT_PORT

    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{ROOM_AGENT_PORT_ENV} must be an integer, got {value!r}.") from exc


def _default_host_from_env() -> str:
    return os.getenv(ROOM_AGENT_HOST_ENV, DEFAULT_ROOM_AGENT_HOST)


def _default_port_from_env() -> int:
    return _read_port_from_env(os.environ)


def get_llm_provider_registry() -> LLMProviderRegistry:
    """Return the process-wide LLM provider registry singleton."""
    global _LLM_PROVIDER_REGISTRY
    if _LLM_PROVIDER_REGISTRY is None:
        settings = get_settings()
        _LLM_PROVIDER_REGISTRY = create_llm_provider_registry(settings.llm)
    return _LLM_PROVIDER_REGISTRY


def _describe_exception(exc: BaseException) -> tuple[str, str]:
    """Format exception details for structured health-check logging."""
    error_type = type(exc).__name__
    message = f"{error_type}: {exc}"

    if isinstance(exc, BaseExceptionGroup):
        nested_messages = [_describe_exception(item)[1] for item in exc.exceptions]
        if nested_messages:
            message = f"{message} | nested=[{'; '.join(nested_messages)}]"

    return error_type, message


async def probe_home_assistant_mcp(
    client: MCPToolClient | None,
    settings: HomeAssistantMCPSettings | None,
) -> MCPHealthStatus:
    """Probe prompt capability without interrupting room-agent startup."""
    status = MCPHealthStatus(
        enabled=bool(settings and settings.enabled),
        server_name=settings.server_name if settings else None,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )
    if settings is None or not settings.enabled:
        return status
    if client is None:
        status.error = "Home Assistant MCP is enabled but client was not initialized."
        return status
    if not settings.health_check.enabled:
        status.healthy = True
        return status

    try:
        result = await client.list_prompts(settings.server_name)
        prompts = getattr(result, "prompts", None)
        status.prompt_count = len(prompts) if prompts is not None else 0
        status.healthy = True
    except Exception as exc:
        status.error_type, status.error = _describe_exception(exc)
    return status


@dataclass(slots=True)
class ServiceRuntime:
    """Coordinates the long-lived tasks hosted by the RoomAgent process."""

    host: str = field(default_factory=_default_host_from_env)
    port: int = field(default_factory=_default_port_from_env)
    business_poll_interval_seconds: float = 30.0
    gateway_registration_startup_delay_seconds: float = 0.1
    gateway_client: GatewayClient | None = None

    async def run(self) -> None:
        """Run the HTTP server loop and the business loop in one event loop."""
        global _MCP_CLIENT
        global _MCP_HEALTH_STATUS

        settings = get_settings()
        llm_registry = get_llm_provider_registry()
        _MCP_CLIENT = build_home_assistant_mcp_client(settings.agent.home_assistant_mcp)
        _MCP_HEALTH_STATUS = await probe_home_assistant_mcp(
            _MCP_CLIENT,
            settings.agent.home_assistant_mcp,
        )
        gateway_client = self.gateway_client
        if settings.agent.gateway and gateway_client is None:
            gateway_client = GatewayClient(bind_host=self.host, port=self.port)
            self.gateway_client = gateway_client
        logger.info(
            "RoomAgent settings loaded for agent=%s room=%s powerful_provider=%s low_cost_provider=%s",
            settings.agent.id,
            settings.agent.room_id,
            (
                type(llm_registry.get(LLMRole.POWERFUL)).__name__
                if llm_registry.get(LLMRole.POWERFUL)
                else "None"
            ),
            (
                type(llm_registry.get(LLMRole.LOW_COST)).__name__
                if llm_registry.get(LLMRole.LOW_COST)
                else "None"
            ),
        )
        logger.info(
            "Home Assistant MCP status enabled=%s healthy=%s server=%s prompt_count=%s error_type=%s error=%s",
            _MCP_HEALTH_STATUS.enabled,
            _MCP_HEALTH_STATUS.healthy,
            _MCP_HEALTH_STATUS.server_name,
            _MCP_HEALTH_STATUS.prompt_count,
            _MCP_HEALTH_STATUS.error_type,
            _MCP_HEALTH_STATUS.error,
        )

        stop_event = asyncio.Event()
        tasks = [
            asyncio.create_task(self.run_a2a_http_server(stop_event), name="roomagent-a2a-http"),
            asyncio.create_task(self.run_business_loop(stop_event), name="roomagent-business-loop"),
        ]

        if (
            settings.agent.gateway
            and settings.agent.gateway.register_on_startup
            and gateway_client is not None
        ):
            await asyncio.sleep(self.gateway_registration_startup_delay_seconds)
            await gateway_client.register_agent(settings)
            tasks.append(
                asyncio.create_task(
                    self.run_gateway_heartbeat_loop(stop_event),
                    name="roomagent-gateway-heartbeat",
                )
            )

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
        settings = get_settings()
        public_url = None
        try:
            public_url = resolve_agent_card_url(settings, self.host, self.port)
        except PublicUrlResolutionError as exc:
            logger.warning("Unable to resolve RoomAgent public URL for agent-card: %s", exc)
        app = build_a2a_application(host=self.host, port=self.port, public_url=public_url).build()

        server = uvicorn.Server(
            uvicorn.Config(
                app,
                host=self.host,
                port=self.port,
                log_level="info",
            )
        )
        server_task = asyncio.create_task(server.serve(), name="roomagent-uvicorn")

        logger.info(
            "RoomAgent A2A HTTP server started on http://%s:%s agent_card_url=%s",
            self.host,
            self.port,
            public_url or f"http://{self.host}:{self.port}/",
        )
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

    async def run_gateway_heartbeat_loop(self, stop_event: asyncio.Event) -> None:
        """Send heartbeat requests to the backend gateway on the configured interval."""
        settings = get_settings()
        gateway = settings.agent.gateway
        if gateway is None:
            return

        logger.info(
            "Gateway heartbeat loop started for agent=%s interval=%ss",
            settings.agent.id,
            gateway.heartbeat_interval,
        )
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=gateway.heartbeat_interval,
                )
            except TimeoutError:
                pass
            if stop_event.is_set():
                break
            if self.gateway_client is not None:
                await self.gateway_client.send_heartbeat(settings)
        logger.info("Gateway heartbeat loop stopped.")

    async def tick_business_jobs(self) -> None:
        """Reserved hook for future scheduled business queries."""
        return None


async def main(*, host: str = DEFAULT_ROOM_AGENT_HOST, port: int = DEFAULT_ROOM_AGENT_PORT) -> None:
    """Module-level async entrypoint."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    await ServiceRuntime(host=host, port=port).run()


def cli() -> None:
    """Synchronous console-script entrypoint for packaging tools."""
    global _CONFIG_PATH
    global _LLM_CONFIG_PATH

    args = parse_args()
    _CONFIG_PATH = args.config_path
    _LLM_CONFIG_PATH = args.llm_config_path
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main(host=args.host, port=args.port))


if __name__ == "__main__":
    raise SystemExit(DIRECT_EXECUTION_ERROR)
