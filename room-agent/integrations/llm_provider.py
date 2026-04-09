"""LLM provider factory using LangChain's OpenAI-compatible integration."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol, cast

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from config.settings import LLMModelSettings, LLMRole, LLMSettings


class BoundChatProvider(Protocol):
    async def ainvoke(self, input: list[BaseMessage]) -> AIMessage: ...


class ChatProvider(Protocol):
    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str: ...

    async def invoke_messages(
        self,
        messages: list[BaseMessage],
        *,
        temperature: float | None = None,
        tools: Sequence[BaseTool] | None = None,
    ) -> AIMessage: ...

    def bind_tools(
        self,
        tools: Sequence[BaseTool],
        *,
        temperature: float | None = None,
    ) -> BoundChatProvider: ...


class ProviderError(RuntimeError):
    """Raised when an upstream LLM provider returns an invalid response."""


class OpenAICompatibleProvider:
    def __init__(self, settings: LLMModelSettings) -> None:
        self.settings = settings
        self.model = ChatOpenAI(
            model=settings.model,
            api_key=SecretStr(settings.api_key),
            base_url=settings.base_url,
            temperature=settings.temperature,
            extra_body={"enable_thinking": False},
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
        content = normalize_message_content(response)
        if not content:
            raise ProviderError("OpenAI-compatible provider returned empty content.")
        return content

    async def invoke_messages(
        self,
        messages: list[BaseMessage],
        *,
        temperature: float | None = None,
        tools: Sequence[BaseTool] | None = None,
    ) -> AIMessage:
        bound_model = self.bind_tools(tools or [], temperature=temperature)
        response = await bound_model.ainvoke(messages)
        if not isinstance(response, AIMessage):
            raise ProviderError("OpenAI-compatible provider returned a non-AIMessage response.")
        return response

    def bind_tools(
        self,
        tools: Sequence[BaseTool],
        *,
        temperature: float | None = None,
    ) -> BoundChatProvider:
        model: Any = self.model
        if temperature is not None:
            model = model.bind(temperature=temperature)
        if tools:
            return cast(BoundChatProvider, model.bind_tools(list(tools)))
        return cast(BoundChatProvider, model)


class LLMProviderRegistry:
    def __init__(
        self,
        *,
        powerful: ChatProvider | None,
        low_cost: ChatProvider | None,
    ) -> None:
        fallback = low_cost or powerful
        self._providers = {
            LLMRole.POWERFUL: powerful or fallback,
            LLMRole.LOW_COST: low_cost or fallback,
        }

    def get(self, role: LLMRole) -> ChatProvider | None:
        return self._providers.get(role)


def create_llm_provider(settings: LLMModelSettings) -> ChatProvider | None:
    return OpenAICompatibleProvider(settings)


def create_llm_provider_registry(settings: LLMSettings) -> LLMProviderRegistry:
    return LLMProviderRegistry(
        powerful=create_llm_provider(settings.for_role(LLMRole.POWERFUL)),
        low_cost=create_llm_provider(settings.for_role(LLMRole.LOW_COST)),
    )


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


def normalize_message_content(message: BaseMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    if isinstance(message.content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in message.content
        )
    return str(message.content)
