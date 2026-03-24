from __future__ import annotations

import asyncio

from app.server import MCPHealthStatus, get_mcp_health_status, initialize_runtime_dependencies, probe_home_assistant_mcp
from config.settings import AgentSettings, HomeAssistantMCPSettings, RuntimeSettings, Settings


class PromptResult:
    def __init__(self, prompts):
        self.prompts = prompts


class HealthyClient:
    async def list_prompts(self, server_name: str):
        assert server_name == "home_assistant"
        return PromptResult(prompts=["device_control"])


class FailingClient:
    async def list_prompts(self, server_name: str):
        raise RuntimeError(f"server unavailable: {server_name}")


def test_probe_home_assistant_mcp_marks_healthy_from_prompt_listing() -> None:
    status = asyncio.run(
        probe_home_assistant_mcp(
            HealthyClient(),
            HomeAssistantMCPSettings(
                enabled=True,
                server_name="home_assistant",
                url="http://ha.local:8123/mcp",
            ),
        )
    )

    assert status.enabled is True
    assert status.healthy is True
    assert status.prompt_count == 1
    assert status.error is None


def test_probe_home_assistant_mcp_failure_does_not_raise() -> None:
    status = asyncio.run(
        probe_home_assistant_mcp(
            FailingClient(),
            HomeAssistantMCPSettings(
                enabled=True,
                server_name="home_assistant",
                url="http://ha.local:8123/mcp",
            ),
        )
    )

    assert status.enabled is True
    assert status.healthy is False
    assert status.prompt_count is None
    assert status.error == "server unavailable: home_assistant"


def test_initialize_runtime_dependencies_exposes_health_status_snapshot() -> None:
    initialize_runtime_dependencies(
        settings=Settings.model_construct(
            agent=AgentSettings(),
            llm=None,
            runtime=RuntimeSettings(
                room_agent_config_path="room-agent/config/examples/room_agent.example.yaml"
            ),
        ),
        llm_provider_registry=object(),
        mcp_client=None,
        mcp_health_status=MCPHealthStatus(
            enabled=True,
            healthy=False,
            server_name="home_assistant",
            error="server unavailable",
        ),
    )

    health = get_mcp_health_status()

    assert health["enabled"] is True
    assert health["healthy"] is False
    assert health["server_name"] == "home_assistant"
    assert health["error"] == "server unavailable"
