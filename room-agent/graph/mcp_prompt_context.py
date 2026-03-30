"""Shared MCP prompt context builder for graph nodes."""

from __future__ import annotations

import json
import logging
from typing import Any, cast


logger = logging.getLogger(__name__)


async def build_mcp_prompts_context(
    *,
    client: Any,
    server_name: str | None,
) -> str:
    """Build a normalized MCP prompts block from list_prompts + get_prompt."""
    if client is None or not server_name:
        return ""

    try:
        list_result = await client.list_prompts(server_name)
    except Exception as exc:
        logger.info("Failed to list MCP prompts: %s", exc)
        return ""

    prompts = _extract_prompt_items(list_result)
    if not prompts:
        return ""

    lines = ["", "<MCP Prompts>"]
    for idx, prompt in enumerate(prompts, start=1):
        name = str(_get_attr_or_key(prompt, "name") or "").strip() or f"prompt_{idx}"
        description = str(_get_attr_or_key(prompt, "description") or "").strip() or "(无描述)"
        arguments = _extract_prompt_arguments(prompt)
        args_summary = "；".join(arguments) if arguments else "(无参数)"
        content_summary = await _fetch_prompt_content_summary(
            client=client,
            server_name=server_name,
            prompt_name=name,
        )

        lines.append(f"- {name}: {description}")
        lines.append(f"  参数: {args_summary}")
        lines.append(f"  模板内容: {content_summary}")

    lines.append("</MCP Prompts>")
    return "\n".join(lines)


def _extract_prompt_items(result: Any) -> list[Any]:
    prompts = _get_attr_or_key(result, "prompts")
    return prompts if isinstance(prompts, list) else []


def _extract_prompt_arguments(prompt: Any) -> list[str]:
    args = _get_attr_or_key(prompt, "arguments")
    if not isinstance(args, list):
        return []

    summaries: list[str] = []
    for arg in args:
        name = str(_get_attr_or_key(arg, "name") or "").strip()
        if not name:
            continue
        required = bool(_get_attr_or_key(arg, "required"))
        description = str(_get_attr_or_key(arg, "description") or "").strip()
        suffix = "必填" if required else "可选"
        if description:
            summaries.append(f"{name}({suffix}): {description}")
        else:
            summaries.append(f"{name}({suffix})")
    return summaries


async def _fetch_prompt_content_summary(
    *,
    client: Any,
    server_name: str,
    prompt_name: str,
) -> str:
    if not callable(getattr(client, "get_prompt", None)):
        return "(client 不支持 get_prompt)"

    try:
        result = await cast(Any, client).get_prompt(server_name, prompt_name)
    except Exception as exc:
        return f"(获取失败: {type(exc).__name__}: {exc})"

    messages = _get_attr_or_key(result, "messages")
    if not isinstance(messages, list) or not messages:
        return "(无消息内容)"

    pieces: list[str] = []
    for message in messages:
        role = str(_get_attr_or_key(message, "role") or "unknown").strip() or "unknown"
        content = _get_attr_or_key(message, "content")
        content_type = str(_get_attr_or_key(content, "type") or "").strip()

        if content_type == "text":
            text = str(_get_attr_or_key(content, "text") or "").strip()
        else:
            text = _summarize_value(content, limit=80)

        if text:
            pieces.append(f"{role}: {text}")

    if not pieces:
        return "(无可读内容)"
    return " | ".join(pieces)


def _get_attr_or_key(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _summarize_value(value: Any, *, limit: int = 180) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except TypeError:
            text = str(value)

    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."
