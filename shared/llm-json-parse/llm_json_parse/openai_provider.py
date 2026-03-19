from typing import Any
from openai import AsyncOpenAI

from .protocol import JsonRepairProvider


class OpenAIJsonRepairProvider(JsonRepairProvider):
    """JsonRepairProvider implementation using OpenAI's API."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-3.5-turbo",
        base_url: str | None = None,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        request: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            request["response_format"] = {"type": "json_object"}

        completion = await self.client.chat.completions.create(**request)
        content = completion.choices[0].message.content

        if not content:
            raise ValueError("OpenAI returned an empty completion message.")

        return content.strip()


def create_openai_provider(
    api_key: str,
    model: str = "gpt-3.5-turbo",
    base_url: str | None = None,
) -> OpenAIJsonRepairProvider:
    return OpenAIJsonRepairProvider(api_key, model, base_url)
