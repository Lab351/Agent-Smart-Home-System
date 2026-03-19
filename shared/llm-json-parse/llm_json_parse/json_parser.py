"""Shared JSON parsing utilities with optional LLM-based repair."""

from __future__ import annotations

import json
from typing import Any

import jsonschema
import json_repair
from jsonschema import ValidationError

from .protocol import JsonRepairProvider


class JsonRepairError(ValueError):
    """Raised when JSON parsing fails and repair is unavailable or unsuccessful."""


class JsonParserWithRepair:
    """Callable JSON parser with optional LLM-backed repair."""

    def __init__(self, llm_provider: JsonRepairProvider | None = None):
        self.llm_provider = llm_provider

    async def __call__(
        self,
        raw_text: str,
        *,
        schema: dict[str, Any] | None = None,
    ) -> Any:
        """Parse JSON text and optionally repair it via an LLM on failure."""
        last_error: Exception | None = None

        for candidate in _candidate_json_strings(raw_text):
            try:
                parsed = json.loads(candidate)
                _validate_schema(parsed, schema)
                return parsed
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc

        for candidate in _candidate_json_strings(raw_text):
            try:
                parsed = json_repair.loads(candidate)
                _validate_schema(parsed, schema)
                return parsed
            except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                last_error = exc

        if self.llm_provider is None:
            raise JsonRepairError(
                "JSON parsing failed and no LLM repair provider was supplied."
            ) from last_error

        repaired_text = await self.llm_provider.complete_text(
            _build_repair_messages(raw_text, schema=schema),
            json_mode=True,
        )

        for candidate in _candidate_json_strings(repaired_text):
            try:
                parsed = json.loads(candidate)
                _validate_schema(parsed, schema)
                return parsed
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc

        raise JsonRepairError(
            "LLM JSON repair failed to produce valid JSON."
        ) from last_error


def _validate_schema(parsed: Any, schema: dict[str, Any] | None) -> None:
    if schema is not None:
        jsonschema.validate(parsed, schema)


def _candidate_json_strings(raw_text: str) -> list[str]:
    stripped = raw_text.strip()
    candidates = [stripped]

    fenced = _strip_json_fence(stripped)
    if fenced != stripped:
        candidates.append(fenced)

    unique_candidates: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


def _strip_json_fence(raw_text: str) -> str:
    if not raw_text.startswith("```"):
        return raw_text

    lines = raw_text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return raw_text


def _build_repair_messages(
    raw_text: str,
    *,
    schema: dict[str, Any] | None,
) -> list[dict[str, str]]:
    schema_text = (
        json.dumps(schema, ensure_ascii=False, indent=2)
        if schema is not None
        else "无 schema 约束"
    )
    return [
        {
            "role": "system",
            "content": (
                "你是一个 JSON 修复器。"
                "你的唯一任务是把用户提供的内容修复成合法 JSON。"
                "不要补充解释，不要输出 markdown，不要输出代码块，只输出 JSON 本体。"
                "如果提供了 schema，输出必须满足 schema。"
            ),
        },
        {
            "role": "user",
            "content": (
                "请将下面的内容修复为合法 JSON。\n"
                f"Schema:\n{schema_text}\n"
                "待修复内容：\n"
                f"{raw_text}"
            ),
        },
    ]
