"""Helpers for schema-constrained LLM calls with local JSON fallback."""

from __future__ import annotations

import asyncio
from typing import Any

from langchain_core.messages import BaseMessage
from llm_json_parse import JsonParserWithRepair

from integrations.llm_provider import normalize_message_content


async def invoke_structured_output(
    model: Any,
    messages: list[BaseMessage],
    *,
    schema: dict[str, Any],
    temperature: float | None = None,
) -> dict[str, Any]:
    """Prefer provider-side JSON Schema decoding, then fall back to local repair."""
    try:
        runnable = model.with_structured_output(schema, method="json_schema")
        if temperature is not None:
            runnable = runnable.bind(temperature=temperature)
        result = await runnable.ainvoke(messages)
        return _normalize_structured_result(result)
    except BaseException as exc:
        if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt, SystemExit)):
            raise
        runnable = model.bind(temperature=temperature) if temperature is not None else model
        response = await runnable.ainvoke(messages)
        raw_output = normalize_message_content(response)
        parsed = await JsonParserWithRepair()(raw_output, schema=schema)
        if not isinstance(parsed, dict):
            raise TypeError(f"Expected structured output dict, got {type(parsed).__name__}.")
        if not parsed:
            raise ValueError("Structured output fallback produced empty result.")
        return parsed


def _normalize_structured_result(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        return result

    model_dump = getattr(result, "model_dump", None)
    if callable(model_dump):
        parsed = model_dump()
        if isinstance(parsed, dict):
            return parsed

    raise TypeError(f"Expected structured output dict, got {type(result).__name__}.")
