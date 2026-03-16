"""MCP client integration built on langchain-mcp-adapters."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import (
    SSEConnection,
    StdioConnection,
    StreamableHttpConnection,
    WebsocketConnection,
)


MCPConnection = StdioConnection | SSEConnection | StreamableHttpConnection | WebsocketConnection


class MCPToolClient(Protocol):
    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]: ...


class LangChainMCPClient:
    """Thin wrapper over MultiServerMCPClient with file-based config loading."""

    def __init__(self, connections: dict[str, MCPConnection]) -> None:
        self._client = MultiServerMCPClient(connections)

    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]:
        return await self._client.get_tools(server_name=server_name)


def build_mcp_client(config_path: str | None) -> MCPToolClient | None:
    if not config_path:
        return None

    path = Path(config_path)
    if not path.exists():
        return None

    with path.open("r", encoding="utf-8") as file:
        raw_config = json.load(file)

    connections = _load_connections(raw_config)
    if not connections:
        return None
    return LangChainMCPClient(connections)


def _load_connections(raw_config: dict[str, Any]) -> dict[str, MCPConnection]:
    servers = raw_config.get("mcp_servers", [])
    connections: dict[str, MCPConnection] = {}
    for server in servers:
        server_id = server["id"]
        connections[server_id] = _normalize_connection(server)
    return connections


def _normalize_connection(server: dict[str, Any]) -> MCPConnection:
    transport = server.get("transport")
    if not transport:
        transport = "streamable_http" if server.get("url") else "stdio"

    if transport == "stdio":
        return StdioConnection(
            transport="stdio",
            command=server["command"],
            args=server.get("args", []),
            env=server.get("env"),
            cwd=server.get("cwd"),
        )
    if transport == "sse":
        return SSEConnection(
            transport="sse",
            url=server["url"],
            headers=server.get("headers"),
            timeout=server.get("timeout"),
            sse_read_timeout=server.get("sse_read_timeout"),
        )
    if transport == "websocket":
        return WebsocketConnection(
            transport="websocket",
            url=server["url"],
            headers=server.get("headers"),
        )
    return StreamableHttpConnection(
        transport="streamable_http",
        url=server["url"],
        headers=server.get("headers"),
    )
