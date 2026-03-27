"""MCP client integration built on langchain-mcp-adapters."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, TypeAlias

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import (
    SSEConnection,
    StdioConnection,
    StreamableHttpConnection,
    WebsocketConnection,
)

if TYPE_CHECKING:
    from config.settings import HomeAssistantMCPSettings


MCPConnection: TypeAlias = (
    StdioConnection | SSEConnection | StreamableHttpConnection | WebsocketConnection
)


class MCPToolClient(Protocol):
    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]: ...
    async def list_prompts(self, server_name: str) -> Any: ...


class LangChainMCPClient:
    """Thin wrapper over MultiServerMCPClient."""

    def __init__(self, connections: dict[str, MCPConnection]) -> None:
        self._client = MultiServerMCPClient(connections)

    async def get_tools(self, *, server_name: str | None = None) -> list[BaseTool]:
        return await self._client.get_tools(server_name=server_name)

    async def list_prompts(self, server_name: str) -> Any:
        async with self._client.session(server_name) as session:
            return await session.list_prompts()


def build_home_assistant_mcp_client(
    settings: HomeAssistantMCPSettings | None,
) -> MCPToolClient | None:
    if settings is None or not settings.enabled or not settings.is_configured:
        return None

    server = {
        "id": settings.server_name,
        "transport": settings.transport,
        "url": settings.mcp_url,
        "headers": _build_auth_headers(settings.auth_token),
    }
    return LangChainMCPClient({settings.server_name: _normalize_connection(server)})


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
        conn: SSEConnection = {
            "transport": "sse",
            "url": server["url"],
        }
        if server.get("headers") is not None:
            conn["headers"] = server["headers"]
        if server.get("timeout") is not None:
            conn["timeout"] = server["timeout"]
        if server.get("sse_read_timeout") is not None:
            conn["sse_read_timeout"] = server["sse_read_timeout"]
        return conn
    if transport == "websocket":
        return WebsocketConnection(
            transport="websocket",
            url=server["url"],
        )
    return StreamableHttpConnection(
        transport="streamable_http",
        url=server["url"],
        headers=server.get("headers"),
    )


def _build_auth_headers(auth_token: str) -> dict[str, str] | None:
    token = auth_token.strip()
    if not token:
        return None
    return {"Authorization": f"Bearer {token}"}
