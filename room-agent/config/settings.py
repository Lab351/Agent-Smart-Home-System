"""Configuration loading for the rebuilt LangGraph runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


DEFAULT_ROOM_AGENT_CONFIG_PATH = "config/room_agent.yaml"
DEFAULT_LLM_CONFIG_PATH = Path(__file__).with_name("llm.yaml")
LLMRole = Literal["powerful", "low_cost"]


class AgentSettings(BaseModel):
    id: str = "room-agent-default"
    room_id: str = "default-room"
    version: str = "0.1.0"


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
        return self.powerful if role == "powerful" else self.low_cost


class RuntimeSettings(BaseModel):
    room_agent_config_path: str = DEFAULT_ROOM_AGENT_CONFIG_PATH
    mcp_config_path: str | None = None
    log_level: str = "INFO"


class Settings(BaseModel):
    agent: AgentSettings = Field(default_factory=AgentSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    runtime: RuntimeSettings = Field(default_factory=RuntimeSettings)


def _load_yaml_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}
        if not isinstance(data, dict):
            raise ValueError(f"Expected mapping config in {config_path}, got {type(data)!r}")
        return data


def _load_llm_settings(config_path: Path = DEFAULT_LLM_CONFIG_PATH) -> LLMSettings:
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
        powerful=_resolve_llm_role("powerful", providers, roles),
        low_cost=_resolve_llm_role("low_cost", providers, roles),
    )


def _resolve_llm_role(
    role: LLMRole,
    providers: dict[str, LLMProviderConfig],
    roles: dict[str, LLMRoleConfig],
) -> LLMModelSettings:
    role_config = roles.get(role) or _select_fallback_role(roles)
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
    if "low_cost" in roles:
        return roles["low_cost"]
    if "powerful" in roles:
        return roles["powerful"]
    if roles:
        return next(iter(roles.values()))
    raise ValueError("LLM config must define at least one role mapping.")


def load_settings(
    config_path: str | None = None,
    llm_config_path: str | None = None,
) -> Settings:
    resolved_config_path = config_path or DEFAULT_ROOM_AGENT_CONFIG_PATH
    yaml_data = _load_yaml_config(resolved_config_path)
    agent_data = yaml_data.get("agent", {}) if isinstance(yaml_data.get("agent"), dict) else {}
    runtime_data = yaml_data.get("runtime", {}) if isinstance(yaml_data.get("runtime"), dict) else {}

    settings = Settings(
        agent=AgentSettings(
            id=agent_data.get("id", AgentSettings.model_fields["id"].default),
            room_id=agent_data.get("room_id", AgentSettings.model_fields["room_id"].default),
            version=agent_data.get("version", AgentSettings.model_fields["version"].default),
        ),
        llm=_load_llm_settings(Path(llm_config_path) if llm_config_path else DEFAULT_LLM_CONFIG_PATH),
        runtime=RuntimeSettings(
            room_agent_config_path=resolved_config_path,
            mcp_config_path=runtime_data.get("mcp_config_path"),
            log_level=runtime_data.get("log_level", RuntimeSettings.model_fields["log_level"].default),
        ),
    )
    return settings
