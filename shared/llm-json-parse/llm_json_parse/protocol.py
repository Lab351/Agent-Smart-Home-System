from typing import Protocol


class JsonRepairProvider(Protocol):
    """Minimal protocol for LLM-backed JSON repair."""

    async def complete_text(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str: ...
