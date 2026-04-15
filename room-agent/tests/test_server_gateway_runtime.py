from __future__ import annotations

import asyncio
from typing import Any

import app.server as server_module
from app.server import ServiceRuntime, initialize_runtime_dependencies
from config.settings import (
    AgentSettings,
    BeaconSettings,
    GatewaySettings,
    RuntimeSettings,
    Settings,
)


class FakeRegistry:
    def get(self, role: object) -> Any:
        _ = role
        return None


class FakeGatewayClient:
    def __init__(self) -> None:
        self.register_calls = 0
        self.heartbeat_calls = 0

    async def register_agent(self, settings: Settings) -> bool:
        _ = settings
        self.register_calls += 1
        return False

    async def send_heartbeat(self, settings: Settings) -> bool:
        _ = settings
        self.heartbeat_calls += 1
        return True


def _settings(*, register_on_startup: bool) -> Settings:
    return Settings.model_construct(
        agent=AgentSettings(
            id="room-agent-bedroom",
            room_id="bedroom",
            gateway=GatewaySettings(
                url="http://backend.test",
                register_on_startup=register_on_startup,
                heartbeat_interval=1,
                agent_host="http://room-agent.local:10000",
            ),
        ),
        beacon=BeaconSettings(
            enabled=True,
            beacon_id="esp32-beacon-bedroom-01",
            uuid="01234567-89AB-CDEF-0123456789ABCDEF",
            major=2,
            minor=0,
        ),
        llm=None,
        runtime=RuntimeSettings(room_agent_config_path="room_agent.yaml"),
    )


async def _short_lived_a2a_server(
    self: ServiceRuntime,
    stop_event: asyncio.Event,
) -> None:
    _ = self
    await asyncio.sleep(0)
    stop_event.set()


async def _short_lived_business_loop(
    self: ServiceRuntime,
    stop_event: asyncio.Event,
) -> None:
    _ = self
    await stop_event.wait()


def test_runtime_registers_after_starting_a2a_server_even_when_gateway_fails(
    monkeypatch,
) -> None:
    gateway_client = FakeGatewayClient()
    initialize_runtime_dependencies(
        settings=_settings(register_on_startup=True),
        llm_provider_registry=FakeRegistry(),
        mcp_client=None,
    )
    monkeypatch.setattr(server_module, "build_home_assistant_mcp_client", lambda settings: None)
    monkeypatch.setattr(ServiceRuntime, "run_a2a_http_server", _short_lived_a2a_server)
    monkeypatch.setattr(ServiceRuntime, "run_business_loop", _short_lived_business_loop)

    asyncio.run(ServiceRuntime(gateway_client=gateway_client).run())

    assert gateway_client.register_calls == 1
    assert gateway_client.heartbeat_calls == 0


def test_runtime_does_not_register_when_startup_registration_is_disabled(monkeypatch) -> None:
    gateway_client = FakeGatewayClient()
    initialize_runtime_dependencies(
        settings=_settings(register_on_startup=False),
        llm_provider_registry=FakeRegistry(),
        mcp_client=None,
    )
    monkeypatch.setattr(server_module, "build_home_assistant_mcp_client", lambda settings: None)
    monkeypatch.setattr(ServiceRuntime, "run_a2a_http_server", _short_lived_a2a_server)
    monkeypatch.setattr(ServiceRuntime, "run_business_loop", _short_lived_business_loop)

    asyncio.run(ServiceRuntime(gateway_client=gateway_client).run())

    assert gateway_client.register_calls == 0
    assert gateway_client.heartbeat_calls == 0
