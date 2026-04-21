from __future__ import annotations

from pathlib import Path

from config.settings import load_settings


ROOT = Path(__file__).resolve().parents[1]
LLM_CONFIG = ROOT / "config" / "examples" / "llm.example.yaml"


def test_load_settings_parses_gateway_and_runtime_from_room_config(tmp_path: Path) -> None:
    config_path = tmp_path / "room_agent.yaml"
    config_path.write_text(
        """
agent:
  id: "room-agent-bedroom"
  room_id: "bedroom"
  version: "1.0.1"
  home_assistant_mcp:
    enabled: true
    server_name: "home_assistant"
    transport: "streamable_http"
    base_url: "http://ha.local:8123"
    auth_token: "secret-token"
    health_check:
      enabled: true

gateway:
  url: "http://home-gateway.local"
  register_on_startup: true
  heartbeat_interval: 45
  agent_host: "http://room-agent.local"

beacon:
  enabled: true
  beacon_id: "2"
  major: 2
  minor: 0
  measured_power: -59
  interval: 1

runtime:
  log_level: "DEBUG"

observability:
  enabled: true
  raw_event_dir: ".runtime/observability"
  pricing_file: "config/observability.pricing.json"
  sampling_ratio: 0.5
  prometheus:
    enabled: true
    path: "/metrics"
""".strip(),
        encoding="utf-8",
    )

    settings = load_settings(
        config_path=str(config_path),
        llm_config_path=str(LLM_CONFIG),
    )

    assert settings.agent.id == "room-agent-bedroom"
    assert settings.agent.room_id == "bedroom"
    assert settings.agent.version == "1.0.1"
    assert settings.agent.gateway is not None
    assert settings.agent.gateway.url == "http://home-gateway.local"
    assert settings.agent.gateway.register_on_startup is True
    assert settings.agent.gateway.heartbeat_interval == 45
    assert settings.agent.gateway.agent_host == "http://room-agent.local"
    assert settings.beacon is not None
    assert settings.beacon.enabled is True
    assert settings.beacon.beacon_id == "2"
    assert settings.beacon.major == 2
    assert settings.beacon.minor == 0
    assert settings.agent.home_assistant_mcp is not None
    assert settings.agent.home_assistant_mcp.enabled is True
    assert settings.agent.home_assistant_mcp.server_name == "home_assistant"
    assert settings.agent.home_assistant_mcp.transport == "streamable_http"
    assert settings.agent.home_assistant_mcp.base_url == "http://ha.local:8123"
    assert settings.agent.home_assistant_mcp.mcp_url == "http://ha.local:8123/api/mcp"
    assert settings.agent.home_assistant_mcp.auth_token == "secret-token"
    assert settings.agent.home_assistant_mcp.health_check.enabled is True
    assert settings.runtime.room_agent_config_path == str(config_path)
    assert settings.runtime.log_level == "DEBUG"
    assert settings.observability.enabled is True
    assert settings.observability.raw_event_dir == ".runtime/observability"
    assert settings.observability.pricing_file == "config/observability.pricing.json"
    assert settings.observability.sampling_ratio == 0.5
    assert settings.observability.prometheus.enabled is True
    assert settings.observability.prometheus.path == "/metrics"


def test_load_settings_allows_omitted_gateway_agent_host(tmp_path: Path) -> None:
    config_path = tmp_path / "room_agent.yaml"
    config_path.write_text(
        """
agent:
  id: "room-agent-bedroom"
  room_id: "bedroom"

gateway:
  url: "http://backend.test"
  register_on_startup: true
  heartbeat_interval: 45

beacon:
  enabled: true
  beacon_id: "2"
""".strip(),
        encoding="utf-8",
    )

    settings = load_settings(
        config_path=str(config_path),
        llm_config_path=str(LLM_CONFIG),
    )

    assert settings.agent.gateway is not None
    assert settings.agent.gateway.agent_host is None
