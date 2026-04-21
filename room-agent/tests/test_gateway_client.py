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


def _settings(*, agent_host: str | None = "http://room-agent.local:10000") -> Settings:
    return Settings.model_construct(
        agent=AgentSettings(
            id="room-agent-bedroom",
            room_id="bedroom",
            version="1.0.1",
            gateway=GatewaySettings(
                url="http://backend.test",
                register_on_startup=True,
                heartbeat_interval=45,
                agent_host=agent_host,
            ),
        ),
        beacon=BeaconSettings(
            enabled=True,
            beacon_id="2",
            major=2,
            minor=0,
        ),
        llm=None,
        runtime=RuntimeSettings(room_agent_config_path="room_agent.yaml"),
    )


def _fixed_resolver(url: str):
    def resolve(_settings: Settings, _bind_host: str, _port: int) -> str:
        return url

    return resolve


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
        "beacon_id": "2",
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
        "beacon_id": "2",
    }
    assert client.last_registered_public_url == "http://room-agent.local:10000/"


def test_register_agent_uses_resolved_url_when_agent_host_is_omitted() -> None:
    requests: list[tuple[str, dict[str, Any]]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        requests.append((request.url.path, body))
        return httpx.Response(200, json={"success": True, "data": {}})

    client = GatewayClient(
        transport=httpx.MockTransport(handler),
        bind_host="0.0.0.0",
        port=10000,
        public_url_resolver=_fixed_resolver("http://192.168.1.44:10000/"),
    )

    result = asyncio.run(client.register_agent(_settings(agent_host=None)))

    assert result is True
    agent_payload = requests[1][1]
    assert agent_payload["url"] == "http://192.168.1.44:10000/"
    assert agent_payload["documentation_url"] == (
        "http://192.168.1.44:10000/.well-known/agent-card.json"
    )
    assert client.last_registered_public_url == "http://192.168.1.44:10000/"


def test_send_heartbeat_posts_beacon_and_registry_heartbeats() -> None:
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"success": True})

    client = GatewayClient(
        transport=httpx.MockTransport(handler),
        public_url_resolver=_fixed_resolver("http://room-agent.local:10000/"),
    )
    client.is_registered = True
    client.last_registered_public_url = "http://room-agent.local:10000/"

    result = asyncio.run(client.send_heartbeat(_settings()))

    assert result is True
    assert paths == [
        "/api/beacon/2/heartbeat",
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


def test_send_heartbeat_reregisters_when_public_url_changes() -> None:
    requests: list[tuple[str, dict[str, Any] | None]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        requests.append((request.url.path, body))
        return httpx.Response(200, json={"success": True})

    client = GatewayClient(
        transport=httpx.MockTransport(handler),
        public_url_resolver=_fixed_resolver("http://192.168.1.45:10000/"),
    )
    client.is_registered = True
    client.last_registered_public_url = "http://192.168.1.44:10000/"

    result = asyncio.run(client.send_heartbeat(_settings(agent_host=None)))

    assert result is True
    assert [path for path, _ in requests] == [
        "/api/beacon/register",
        "/api/registry/register",
    ]
    assert requests[1][1] is not None
    assert requests[1][1]["url"] == "http://192.168.1.45:10000/"
    assert client.last_registered_public_url == "http://192.168.1.45:10000/"


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
