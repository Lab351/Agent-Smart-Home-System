from __future__ import annotations

import pytest

import app.public_url as public_url
from app.public_url import (
    PublicUrlResolutionError,
    resolve_agent_card_url,
    resolve_public_agent_url,
)
from config.settings import AgentSettings, GatewaySettings, RuntimeSettings, Settings


def _settings(*, agent_host: str | None = None, with_gateway: bool = True) -> Settings:
    return Settings.model_construct(
        agent=AgentSettings(
            id="room-agent-bedroom",
            room_id="bedroom",
            gateway=(
                GatewaySettings(
                    url="http://backend.test:3088",
                    register_on_startup=True,
                    heartbeat_interval=45,
                    agent_host=agent_host,
                )
                if with_gateway
                else None
            ),
        ),
        beacon=None,
        llm=None,
        runtime=RuntimeSettings(room_agent_config_path="room_agent.yaml"),
    )


def test_manual_agent_host_wins_and_normalizes_trailing_slash() -> None:
    resolved = resolve_public_agent_url(
        _settings(agent_host="https://room-agent.example.com/a2a"),
        bind_host="0.0.0.0",
        port=10000,
    )

    assert resolved == "https://room-agent.example.com/a2a/"


def test_udp_route_detected_ip_builds_http_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_url, "_detect_route_local_ip", lambda gateway_url: "192.168.1.44")
    monkeypatch.setattr(public_url, "_enumerate_host_ipv4_candidates", lambda: [])

    resolved = resolve_public_agent_url(_settings(), bind_host="0.0.0.0", port=10000)

    assert resolved == "http://192.168.1.44:10000/"


def test_invalid_addresses_are_ignored_before_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_url, "_detect_route_local_ip", lambda gateway_url: None)
    monkeypatch.setattr(
        public_url,
        "_enumerate_host_ipv4_candidates",
        lambda: ["127.0.0.1", "0.0.0.0", "169.254.1.1", "224.0.0.1", "10.0.0.8"],
    )

    resolved = resolve_public_agent_url(_settings(), bind_host="0.0.0.0", port=10000)

    assert resolved == "http://10.0.0.8:10000/"


def test_resolution_fails_when_no_valid_ip_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(public_url, "_detect_route_local_ip", lambda gateway_url: None)
    monkeypatch.setattr(
        public_url,
        "_enumerate_host_ipv4_candidates",
        lambda: ["127.0.0.1", "0.0.0.0", "169.254.1.1"],
    )

    with pytest.raises(PublicUrlResolutionError):
        resolve_public_agent_url(_settings(), bind_host="127.0.0.1", port=10000)


def test_agent_card_url_can_resolve_lan_ip_without_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(public_url, "_enumerate_host_ipv4_candidates", lambda: ["192.168.1.44"])

    resolved = resolve_agent_card_url(
        _settings(with_gateway=False),
        bind_host="0.0.0.0",
        port=10000,
    )

    assert resolved == "http://192.168.1.44:10000/"


def test_agent_card_url_keeps_loopback_bind_for_local_only_testing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(public_url, "_enumerate_host_ipv4_candidates", lambda: [])

    resolved = resolve_agent_card_url(
        _settings(with_gateway=False),
        bind_host="127.0.0.1",
        port=10000,
    )

    assert resolved == "http://127.0.0.1:10000/"
