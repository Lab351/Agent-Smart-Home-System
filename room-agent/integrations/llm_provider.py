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
        powerful: ChatOpenAI | None,
        low_cost: ChatOpenAI | None,
    ) -> None:
        fallback = low_cost or powerful
        self._providers = {
            LLMRole.POWERFUL: powerful or fallback,
            LLMRole.LOW_COST: low_cost or fallback,
        }

    def get(self, role: LLMRole) -> ChatOpenAI | None:
        return self._providers.get(role)


def create_llm_provider(settings: LLMModelSettings) -> ChatOpenAI | None:
    return ChatOpenAI(
        model=settings.model,
        api_key=SecretStr(settings.api_key),
        base_url=settings.base_url,
        temperature=settings.temperature,
        extra_body={"enable_thinking": False},
    )



def create_llm_provider_registry(settings: LLMSettings) -> LLMProviderRegistry:
    return LLMProviderRegistry(
        powerful=create_llm_provider(settings.for_role(LLMRole.POWERFUL)),
        low_cost=create_llm_provider(settings.for_role(LLMRole.LOW_COST)),
    )


def normalize_message_content(message: BaseMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    if isinstance(message.content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in message.content
        )
    return str(message.content)
