from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from app.gateway_client import GatewayClient
from config.settings import (
    AgentSettings,
    BeaconSettings,
    GatewaySettings,
    RuntimeSettings,
    Settings,
)


def _settings() -> Settings:
    return Settings.model_construct(
        agent=AgentSettings(
            id="room-agent-bedroom",
            room_id="bedroom",
            version="1.0.1",
            gateway=GatewaySettings(
                url="http://backend.test",
                register_on_startup=True,
                heartbeat_interval=45,
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


def test_register_agent_posts_beacon_mapping_then_agent_card() -> None:
    requests: list[tuple[str, dict[str, Any]]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        requests.append((request.url.path, body))
        return httpx.Response(200, json={"success": True, "data": {}})

    client = GatewayClient(transport=httpx.MockTransport(handler))

    result = asyncio.run(client.register_agent(_settings()))

    assert result is True
    assert client.is_registered is True
    assert [path for path, _ in requests] == [
        "/api/beacon/register",
        "/api/registry/register",
    ]

    beacon_payload = requests[0][1]
    assert beacon_payload == {
        "beacon_id": "esp32-beacon-bedroom-01",
        "room_id": "bedroom",
        "agent_id": "room-agent-bedroom",
        "capabilities": ["device_control", "state_query", "automation"],
        "devices": [],
    }

    agent_payload = requests[1][1]
    assert agent_payload["id"] == "room-agent-bedroom"
    assert agent_payload["agent_type"] == "room"
    assert agent_payload["url"] == "http://room-agent.local:10000/"
    assert agent_payload["documentation_url"] == (
        "http://room-agent.local:10000/.well-known/agent-card.json"
    )
    assert agent_payload["communication"]["backend"] == "a2a_sdk"
    assert agent_payload["metadata"] == {
        "room_id": "bedroom",
        "beacon_id": "esp32-beacon-bedroom-01",
    }


def test_send_heartbeat_posts_beacon_and_registry_heartbeats() -> None:
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"success": True})

    client = GatewayClient(transport=httpx.MockTransport(handler))
    client.is_registered = True

    result = asyncio.run(client.send_heartbeat(_settings()))

    assert result is True
    assert paths == [
        "/api/beacon/esp32-beacon-bedroom-01/heartbeat",
        "/api/registry/room-agent-bedroom/heartbeat",
    ]


def test_send_heartbeat_retries_registration_when_not_registered() -> None:
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"success": True})

    client = GatewayClient(transport=httpx.MockTransport(handler))

    result = asyncio.run(client.send_heartbeat(_settings()))

    assert result is True
    assert client.is_registered is True
    assert paths == [
        "/api/beacon/register",
        "/api/registry/register",
    ]


def test_registration_failure_is_best_effort_and_records_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        _ = request
        return httpx.Response(503, json={"success": False, "message": "unavailable"})

    client = GatewayClient(transport=httpx.MockTransport(handler))

    result = asyncio.run(client.register_agent(_settings()))

    assert result is False
    assert client.is_registered is False
    assert client.last_error is not None
    assert "HTTPStatusError" in client.last_error
