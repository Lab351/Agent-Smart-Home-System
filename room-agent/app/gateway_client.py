"""HTTP client for RoomAgent registration with qwen-backend."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import httpx

from config.settings import BeaconSettings, GatewaySettings, Settings
from .public_url import resolve_public_agent_url


logger = logging.getLogger(__name__)

ROOM_AGENT_CAPABILITIES = ["device_control", "state_query", "automation"]
ROOM_AGENT_SKILLS = [
    {
        "id": "home_device_control_and_automation",
        "name": "家居状态控制与自动化",
        "description": "查询家居终端状态、执行状态修改，并安排房间级自动化规则。",
        "tags": ROOM_AGENT_CAPABILITIES,
    }
]


class GatewayClient:
    """Best-effort HTTP client for qwen-backend registration and heartbeat."""

    def __init__(
        self,
        *,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
        bind_host: str | None = None,
        port: int | None = None,
        public_url_resolver: Callable[[Settings, str, int], str] = resolve_public_agent_url,
    ) -> None:
        self.timeout = timeout
        self.transport = transport
        self.bind_host = bind_host or os.getenv("ROOM_AGENT_HOST", "127.0.0.1")
        self.port = port or int(os.getenv("ROOM_AGENT_PORT", "10000"))
        self.public_url_resolver = public_url_resolver
        self.is_registered = False
        self.last_registered_public_url: str | None = None
        self.last_error: str | None = None

    async def register_agent(self, settings: Settings) -> bool:
        """Register beacon mapping and AgentCard with qwen-backend."""
        gateway = settings.agent.gateway
        if gateway is None:
            self.is_registered = False
            self.last_registered_public_url = None
            self.last_error = "Gateway settings are not configured."
            return False

        try:
            public_url = self._resolve_public_url(settings)
            async with self._client() as client:
                if settings.beacon and settings.beacon.enabled:
                    await self._post_json(
                        client,
                        _join_url(gateway.url, "/api/beacon/register"),
                        _build_beacon_registration_payload(settings),
                    )
                await self._post_json(
                    client,
                    _join_url(gateway.url, "/api/registry/register"),
                    _build_agent_registration_payload(settings, gateway, public_url),
                )
        except Exception as exc:
            self.is_registered = False
            self.last_registered_public_url = None
            self.last_error = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "Failed to register RoomAgent with qwen-backend: %s",
                self.last_error,
            )
            return False

        self.is_registered = True
        self.last_registered_public_url = public_url
        self.last_error = None
        logger.info(
            "Registered RoomAgent with qwen-backend agent=%s beacon=%s url=%s",
            settings.agent.id,
            settings.beacon.beacon_id if settings.beacon else None,
            public_url,
        )
        return True

    async def send_heartbeat(self, settings: Settings) -> bool:
        """Send beacon and agent heartbeat requests, retrying registration if needed."""
        gateway = settings.agent.gateway
        if gateway is None:
            self.is_registered = False
            self.last_registered_public_url = None
            self.last_error = "Gateway settings are not configured."
            return False

        if not self.is_registered:
            return await self.register_agent(settings)

        try:
            public_url = self._resolve_public_url(settings)
            if public_url != self.last_registered_public_url:
                logger.info(
                    "RoomAgent public URL changed from %s to %s; re-registering.",
                    self.last_registered_public_url,
                    public_url,
                )
                return await self.register_agent(settings)

            async with self._client() as client:
                if settings.beacon and settings.beacon.enabled:
                    await self._post_json(
                        client,
                        _join_url(
                            gateway.url,
                            f"/api/beacon/{quote(settings.beacon.beacon_id, safe='')}/heartbeat",
                        ),
                        None,
                    )
                await self._post_json(
                    client,
                    _join_url(
                        gateway.url,
                        f"/api/registry/{quote(settings.agent.id, safe='')}/heartbeat",
                    ),
                    None,
                )
        except Exception as exc:
            self.is_registered = False
            self.last_registered_public_url = None
            self.last_error = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "Failed to send RoomAgent heartbeat to qwen-backend: %s",
                self.last_error,
            )
            return False

        self.last_error = None
        return True

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.timeout, transport=self.transport)

    def _resolve_public_url(self, settings: Settings) -> str:
        return self.public_url_resolver(settings, self.bind_host, self.port).rstrip("/") + "/"

    async def _post_json(
        self,
        client: httpx.AsyncClient,
        url: str,
        payload: dict[str, Any] | None,
    ) -> None:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        try:
            body = response.json()
        except ValueError:
            return
        if isinstance(body, dict) and body.get("success") is False:
            raise RuntimeError(str(body.get("message") or "qwen-backend returned success=false"))


def _build_beacon_registration_payload(settings: Settings) -> dict[str, Any]:
    beacon = _require_enabled_beacon(settings.beacon)
    return {
        "beacon_id": beacon.beacon_id,
        "room_id": settings.agent.room_id,
        "agent_id": settings.agent.id,
        "capabilities": ROOM_AGENT_CAPABILITIES,
        "devices": [],
    }


def _build_agent_registration_payload(
    settings: Settings,
    gateway: GatewaySettings | None = None,
    public_url: str | None = None,
) -> dict[str, Any]:
    gateway = gateway or _require_gateway(settings)
    resolved_url = public_url or resolve_public_agent_url(settings, "127.0.0.1", 10000)
    agent_url = resolved_url.rstrip("/") + "/"
    return {
        "id": settings.agent.id,
        "name": f"{settings.agent.room_id} RoomAgent",
        "description": f"管理 {settings.agent.room_id} 房间设备和房间状态的 RoomAgent A2A 服务。",
        "version": settings.agent.version,
        "agent_type": "room",
        "capabilities": ROOM_AGENT_CAPABILITIES,
        "skills": ROOM_AGENT_SKILLS,
        "devices": [],
        "communication": {
            "backend": "a2a_sdk",
            "a2a_sdk": {
                "transport": "jsonrpc-http",
            },
        },
        "url": agent_url,
        "documentation_url": agent_url.rstrip("/") + "/.well-known/agent-card.json",
        "authentication": {
            "type": "none",
        },
        "metadata": {
            "room_id": settings.agent.room_id,
            "beacon_id": settings.beacon.beacon_id if settings.beacon else None,
        },
    }


def _require_gateway(settings: Settings) -> GatewaySettings:
    if settings.agent.gateway is None:
        raise ValueError("Gateway settings are required for qwen-backend registration.")
    return settings.agent.gateway


def _require_enabled_beacon(beacon: BeaconSettings | None) -> BeaconSettings:
    if beacon is None:
        raise ValueError("Beacon settings are required for qwen-backend beacon registration.")
    if not beacon.enabled:
        raise ValueError("Beacon registration requires beacon.enabled=true.")
    return beacon


def _join_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + "/" + path.lstrip("/")
