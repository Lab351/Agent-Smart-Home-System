"""LLM registry utilities using LangChain's ChatOpenAI."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from config.settings import LLMModelSettings, LLMRole, LLMSettings


class LLMProviderRegistry:
    def __init__(
        self,
        *,
        powerful: LLMModelSettings | None,
        low_cost: LLMModelSettings | None,
        default_enable_thinking: bool = False,
    ) -> None:
        fallback = low_cost or powerful
        self._settings = {
            LLMRole.POWERFUL: powerful or fallback,
            LLMRole.LOW_COST: low_cost or fallback,
        }
        self._default_enable_thinking = default_enable_thinking
        self._providers: dict[tuple[LLMRole, bool], ChatOpenAI | None] = {}

    def get(
        self,
        role: LLMRole,
        *,
        enable_thinking: bool | None = None,
    ) -> ChatOpenAI | None:
        if enable_thinking is None:
            enable_thinking = self._default_enable_thinking
        key = (role, enable_thinking)
        if key not in self._providers:
            settings = self._settings.get(role)
            self._providers[key] = (
                create_llm_provider(settings, enable_thinking=enable_thinking)
                if settings is not None
                else None
            )
        return self._providers[key]


def create_llm_provider(
    settings: LLMModelSettings,
    *,
    enable_thinking: bool = False,
) -> ChatOpenAI | None:
    provider_kwargs = _build_provider_kwargs(settings, enable_thinking=enable_thinking)
    return ChatOpenAI(
        model=settings.model,
        api_key=SecretStr(settings.api_key),
        base_url=settings.base_url,
        temperature=settings.temperature,
        use_responses_api=True,
        **provider_kwargs,
    )


def create_llm_provider_registry(
    settings: LLMSettings,
    *,
    default_enable_thinking: bool = False,
) -> LLMProviderRegistry:
    return LLMProviderRegistry(
        powerful=settings.for_role(LLMRole.POWERFUL),
        low_cost=settings.for_role(LLMRole.LOW_COST),
        default_enable_thinking=default_enable_thinking,
    )


def _build_provider_kwargs(
    _settings: LLMModelSettings,
    *,
    enable_thinking: bool,
) -> dict[str, Any]:
    return {
        "reasoning": {
            "effort": "medium" if enable_thinking else "none",
        }
    }


def normalize_message_content(message: BaseMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    if isinstance(message.content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in message.content
        )
    return str(message.content)
