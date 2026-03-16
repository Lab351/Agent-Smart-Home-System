"""LLM provider factory using LangChain's OpenAI-compatible integration."""

from __future__ import annotations

from typing import Protocol

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from config.settings import LLMSettings


class ChatProvider(Protocol):
    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str: ...


class ProviderError(RuntimeError):
    """Raised when an upstream LLM provider returns an invalid response."""


class OpenAICompatibleProvider:
    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings
        self.model = ChatOpenAI(
            model=settings.model,
            api_key=settings.compatible_api_key,
            base_url=settings.openai_base_url,
            temperature=settings.temperature,
        )

    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        model = self.model.bind(temperature=temperature)
        if json_mode:
            model = model.bind(response_format={"type": "json_object"})

        response = await model.ainvoke(_to_langchain_messages(messages))
        content = _normalize_ai_message_content(response)
        if not content:
            raise ProviderError("OpenAI-compatible provider returned empty content.")
        return content


def create_llm_provider(settings: LLMSettings) -> ChatProvider | None:
    if not settings.has_credentials:
        return None

    return OpenAICompatibleProvider(settings)


def _to_langchain_messages(messages: list[dict[str, str]]) -> list[BaseMessage]:
    converted: list[BaseMessage] = []
    for message in messages:
        role = message["role"]
        content = message["content"]
        if role == "system":
            converted.append(SystemMessage(content=content))
        elif role == "assistant":
            converted.append(AIMessage(content=content))
        else:
            converted.append(HumanMessage(content=content))
    return converted


def _normalize_ai_message_content(message: AIMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    if isinstance(message.content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in message.content
        )
    return str(message.content)
