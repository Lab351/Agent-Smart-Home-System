from __future__ import annotations

import pytest
from pydantic import ValidationError

from config.settings import HomeAssistantMCPSettings
from integrations.mcp_client import LangChainMCPClient, build_home_assistant_mcp_client


def test_build_home_assistant_mcp_client_returns_none_when_disabled() -> None:
    settings = HomeAssistantMCPSettings(enabled=False, base_url="http://ha.local:8123")

    client = build_home_assistant_mcp_client(settings)

    assert client is None


def test_build_home_assistant_mcp_client_uses_streamable_http_and_bearer_token() -> None:
    settings = HomeAssistantMCPSettings(
        enabled=True,
        server_name="home_assistant",
        transport="streamable_http",
        base_url="http://ha.local:8123",
        auth_token="secret-token",
    )

    client = build_home_assistant_mcp_client(settings)

    assert isinstance(client, LangChainMCPClient)
    connection = client._client.connections["home_assistant"]
    assert connection["transport"] == "streamable_http"
    assert connection["url"] == "http://ha.local:8123/api/mcp"
    assert connection["headers"] == {"Authorization": "Bearer secret-token"}


def test_build_home_assistant_mcp_client_normalizes_trailing_slash() -> None:
    settings = HomeAssistantMCPSettings(
        enabled=True,
        server_name="home_assistant",
        transport="streamable_http",
        base_url="http://ha.local:8123/",
    )

    client = build_home_assistant_mcp_client(settings)

    assert isinstance(client, LangChainMCPClient)
    connection = client._client.connections["home_assistant"]
    assert connection["url"] == "http://ha.local:8123/api/mcp"


def test_home_assistant_mcp_settings_reject_stdio_transport() -> None:
    with pytest.raises(ValidationError):
        HomeAssistantMCPSettings(
            enabled=True,
            transport="stdio",
            base_url="http://ha.local:8123",
        )
