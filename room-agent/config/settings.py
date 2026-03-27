"""Configuration loading for the rebuilt LangGraph runtime."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


class LLMRole(StrEnum):
    POWERFUL = "powerful"
    LOW_COST = "low_cost"


class AgentSettings(BaseModel):
    id: str = "room-agent-default"
    room_id: str = "default-room"
    version: str = "0.1.0"
    gateway: "GatewaySettings | None" = None
    home_assistant_mcp: "HomeAssistantMCPSettings | None" = None


class GatewaySettings(BaseModel):
    url: str
    register_on_startup: bool = True
    heartbeat_interval: int = 60
    agent_host: str


class MCPHealthCheckSettings(BaseModel):
    enabled: bool = True


class HomeAssistantMCPSettings(BaseModel):
    enabled: bool = False
    server_name: str = "home_assistant"
    transport: Literal["streamable_http", "sse", "websocket"] = "streamable_http"
    base_url: str = ""
    auth_token: str = ""
    health_check: MCPHealthCheckSettings = Field(default_factory=MCPHealthCheckSettings)

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url.strip())

    @property
    def mcp_url(self) -> str:
        base_url = self.base_url.strip().rstrip("/")
        if not base_url:
            return ""
        return f"{base_url}/api/mcp"


class LLMSamplingConfig(BaseModel):
    temperature: float = 0.2


class LLMModelConfig(BaseModel):
    model_id: str
    sampling: LLMSamplingConfig = Field(default_factory=LLMSamplingConfig)


class LLMProviderConfig(BaseModel):
    provider_type: Literal["openai_compatible"] = "openai_compatible"
    base_url: str
    api_key: str = ""
    models: dict[str, LLMModelConfig] = Field(default_factory=dict)


class LLMRoleConfig(BaseModel):
    provider: str
    model_key: str


class LLMModelSettings(BaseModel):
    role: LLMRole
    provider_name: str
    provider_type: Literal["openai_compatible"] = "openai_compatible"
    model: str
    api_key: str = ""
    base_url: str
    temperature: float = 0.2

    @property
    def has_credentials(self) -> bool:
        return bool(self.api_key)


class LLMSettings(BaseModel):
    powerful: LLMModelSettings
    low_cost: LLMModelSettings

    @property
    def has_credentials(self) -> bool:
        return self.powerful.has_credentials or self.low_cost.has_credentials

    def for_role(self, role: LLMRole) -> LLMModelSettings:
        return self.powerful if role == LLMRole.POWERFUL else self.low_cost


class RuntimeSettings(BaseModel):
    room_agent_config_path: str
    log_level: str = "INFO"


class Settings(BaseModel):
    agent: AgentSettings = Field(default_factory=AgentSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    runtime: RuntimeSettings = Field(default_factory=RuntimeSettings)


def _load_yaml_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}
        if not isinstance(data, dict):
            raise ValueError(f"Expected mapping config in {config_path}, got {type(data)!r}")
        return data


def _load_llm_settings(config_path: Path) -> LLMSettings:
    raw = _load_yaml_config(str(config_path))
    providers = {
        name: LLMProviderConfig.model_validate(item)
        for name, item in (raw.get("providers") or {}).items()
    }
    roles = {
        name: LLMRoleConfig.model_validate(item)
        for name, item in (raw.get("roles") or {}).items()
    }

    return LLMSettings(
        powerful=_resolve_llm_role(LLMRole.POWERFUL, providers, roles),
        low_cost=_resolve_llm_role(LLMRole.LOW_COST, providers, roles),
    )


def _resolve_llm_role(
    role: LLMRole,
    providers: dict[str, LLMProviderConfig],
    roles: dict[str, LLMRoleConfig],
) -> LLMModelSettings:
    role_config = roles.get(role.value) or _select_fallback_role(roles)
    provider_config = providers[role_config.provider]
    model_config = provider_config.models[role_config.model_key]

    return LLMModelSettings(
        role=role,
        provider_name=role_config.provider,
        provider_type=provider_config.provider_type,
        model=model_config.model_id,
        api_key=provider_config.api_key,
        base_url=provider_config.base_url,
        temperature=model_config.sampling.temperature,
    )


def _select_fallback_role(roles: dict[str, LLMRoleConfig]) -> LLMRoleConfig:
    if LLMRole.LOW_COST.value in roles:
        return roles[LLMRole.LOW_COST.value]
    if LLMRole.POWERFUL.value in roles:
        return roles[LLMRole.POWERFUL.value]
    if roles:
        return next(iter(roles.values()))
    raise ValueError("LLM config must define at least one role mapping.")


def load_settings(
    config_path: str | None = None,
    llm_config_path: str | None = None,
) -> Settings:
    if not config_path:
        raise ValueError("room-agent config path is required.")
    if not llm_config_path:
        raise ValueError("llm config path is required.")

    resolved_config_path = config_path
    yaml_data = _load_yaml_config(resolved_config_path)
    agent_data = yaml_data.get("agent", {}) if isinstance(yaml_data.get("agent"), dict) else {}
    gateway_data = yaml_data.get("gateway", {}) if isinstance(yaml_data.get("gateway"), dict) else {}
    runtime_data = yaml_data.get("runtime", {}) if isinstance(yaml_data.get("runtime"), dict) else {}
    ha_mcp_data = (
        agent_data.get("home_assistant_mcp", {})
        if isinstance(agent_data.get("home_assistant_mcp"), dict)
        else {}
    )

    settings = Settings(
        agent=AgentSettings(
            id=agent_data.get("id", AgentSettings.model_fields["id"].default),
            room_id=agent_data.get("room_id", AgentSettings.model_fields["room_id"].default),
            version=agent_data.get("version", AgentSettings.model_fields["version"].default),
            gateway=GatewaySettings.model_validate(gateway_data) if gateway_data else None,
            home_assistant_mcp=(
                HomeAssistantMCPSettings.model_validate(ha_mcp_data) if ha_mcp_data else None
            ),
        ),
        llm=_load_llm_settings(Path(llm_config_path)),
        runtime=RuntimeSettings(
            room_agent_config_path=resolved_config_path,
            log_level=runtime_data.get("log_level", RuntimeSettings.model_fields["log_level"].default),
        ),
    )
    return settings
