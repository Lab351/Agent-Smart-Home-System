"""Configuration loading for the rebuilt LangGraph runtime."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field


DEFAULT_ROOM_AGENT_CONFIG_PATH = "config/room_agent.yaml"
DEFAULT_OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_LLM_PROVIDER = "openai_compatible"


class AgentSettings(BaseModel):
    id: str = "room-agent-default"
    room_id: str = "default-room"
    version: str = "0.1.0"


class LLMSettings(BaseModel):
    provider: Literal["openai_compatible"] = DEFAULT_LLM_PROVIDER
    model: str = "qwen-plus"
    temperature: float = 0.2
    dashscope_api_key: str | None = None
    dashscope_intl_api_key: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str = DEFAULT_OPENAI_BASE_URL

    @property
    def has_credentials(self) -> bool:
        return bool(self.compatible_api_key)

    @property
    def compatible_api_key(self) -> str | None:
        return self.openai_api_key or self.dashscope_api_key or self.dashscope_intl_api_key


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


def load_settings(config_path: str | None = None) -> Settings:
    load_dotenv(override=False)

    resolved_config_path = config_path or os.getenv(
        "ROOM_AGENT_CONFIG_PATH",
        DEFAULT_ROOM_AGENT_CONFIG_PATH,
    )
    yaml_data = _load_yaml_config(resolved_config_path)
    agent_data = yaml_data.get("agent", {}) if isinstance(yaml_data.get("agent"), dict) else {}

    settings = Settings(
        agent=AgentSettings(
            id=os.getenv("AGENT_ID", agent_data.get("id", AgentSettings.model_fields["id"].default)),
            room_id=os.getenv(
                "ROOM_ID",
                agent_data.get("room_id", AgentSettings.model_fields["room_id"].default),
            ),
            version=agent_data.get("version", AgentSettings.model_fields["version"].default),
        ),
        llm=LLMSettings(
            provider=_normalize_provider(os.getenv("LLM_PROVIDER")),
            model=os.getenv("LLM_MODEL", LLMSettings.model_fields["model"].default),
            temperature=float(
                os.getenv(
                    "LLM_TEMPERATURE",
                    str(LLMSettings.model_fields["temperature"].default),
                )
            ),
            dashscope_api_key=os.getenv("DASHSCOPE_API_KEY"),
            dashscope_intl_api_key=os.getenv("DASHSCOPE_INTL_API_KEY"),
            openai_api_key=os.getenv("OPENAI_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or os.getenv("DASHSCOPE_INTL_API_KEY"),
            openai_base_url=os.getenv(
                "OPENAI_BASE_URL",
                DEFAULT_OPENAI_BASE_URL,
            ),
        ),
        runtime=RuntimeSettings(
            room_agent_config_path=resolved_config_path,
            mcp_config_path=os.getenv("MCP_CONFIG_PATH"),
            log_level=os.getenv("LOG_LEVEL", RuntimeSettings.model_fields["log_level"].default),
        ),
    )
    return settings


def _normalize_provider(raw_provider: str | None) -> str:
    if raw_provider == DEFAULT_LLM_PROVIDER:
        return raw_provider
    return DEFAULT_LLM_PROVIDER
