#!/usr/bin/env python3
"""Minimal A2A debug client for local service testing."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

import httpx
from a2a.client import A2ACardResolver, ClientConfig, ClientFactory
from a2a.client.helpers import create_text_message_object
from a2a.types import Message, MessageSendConfiguration, Task, TaskQueryParams


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Debug an A2A service by resolving its agent card and sending JSON-RPC requests.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Print the full JSON response instead of simplified text output.",
    )
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:10000",
        help="Base URL of the A2A service. Defaults to http://127.0.0.1:10000.",
    )
    parser.add_argument(
        "--card-path",
        default=None,
        help="Optional relative path to the agent card. Defaults to the SDK well-known path.",
    )
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="Extra HTTP header in 'Key: Value' form. Repeatable.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds. Use 0 for no timeout.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("card", help="Fetch and print the resolved agent card.")

    send_parser = subparsers.add_parser("send", help="Send one user message to the agent.")
    send_parser.add_argument("message", help="User message text.")
    send_parser.add_argument("--task-id", default=None, help="Optional existing task ID.")
    send_parser.add_argument("--context-id", default=None, help="Optional existing context ID.")
    send_parser.add_argument(
        "--history-length",
        type=int,
        default=None,
        help="Optional historyLength to attach to message/send.",
    )

    get_task_parser = subparsers.add_parser("get-task", help="Fetch an existing task.")
    get_task_parser.add_argument("task_id", help="Task ID to fetch.")
    get_task_parser.add_argument(
        "--history-length",
        type=int,
        default=None,
        help="Optional historyLength for tasks/get.",
    )

    return parser.parse_args()


def parse_headers(raw_headers: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for item in raw_headers:
        if ":" not in item:
            raise SystemExit(f"Invalid --header value: {item!r}. Expected 'Key: Value'.")
        key, value = item.split(":", 1)
        headers[key.strip()] = value.strip()
    return headers


async def resolve_agent_card(
    *,
    httpx_client: httpx.AsyncClient,
    url: str,
    card_path: str | None,
):
    resolver = A2ACardResolver(httpx_client=httpx_client, base_url=url)
    return await resolver.get_agent_card(relative_card_path=card_path)


async def run() -> int:
    args = parse_args()
    headers = parse_headers(args.header)
    timeout = None if args.timeout == 0 else args.timeout

    async with httpx.AsyncClient(headers=headers, timeout=timeout) as httpx_client:
        agent_card = await resolve_agent_card(
            httpx_client=httpx_client,
            url=args.url,
            card_path=args.card_path,
        )

        if args.command == "card":
            _print_output(
                agent_card.model_dump(mode="json", by_alias=True, exclude_none=True),
                json_output=args.json_output,
            )
            return 0

        client = await ClientFactory.connect(
            agent_card,
            client_config=ClientConfig(
                streaming=False,
                httpx_client=httpx_client,
            ),
        )

        if args.command == "send":
            message = create_text_message_object(content=args.message)
            if args.task_id:
                message.task_id = args.task_id
            if args.context_id:
                message.context_id = args.context_id

            configuration = None
            if args.history_length is not None:
                configuration = MessageSendConfiguration(history_length=args.history_length)

            response = await _send_message(
                client,
                message=message,
                configuration=configuration,
            )
            _print_output(
                response.model_dump(mode="json", by_alias=True, exclude_none=True),
                json_output=args.json_output,
            )
            return 0

        if args.command == "get-task":
            response = await client.get_task(
                TaskQueryParams(
                    id=args.task_id,
                    history_length=args.history_length,
                )
            )
            _print_output(
                response.model_dump(mode="json", by_alias=True, exclude_none=True),
                json_output=args.json_output,
            )
            return 0

    raise SystemExit(f"Unsupported command: {args.command}")


async def _send_message(
    client,
    *,
    message: Message,
    configuration: MessageSendConfiguration | None,
) -> Task | Message:
    async for event in client.send_message(
        message,
        configuration=configuration,
    ):
        if isinstance(event, tuple):
            task, _ = event
            return task
        return event
    raise RuntimeError("A2A client returned no response event.")


def _print_output(payload: dict[str, Any], *, json_output: bool) -> None:
    if json_output:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print(_format_payload(payload))


def _format_payload(payload: dict[str, Any]) -> str:
    if payload.get("kind") == "message":
        return _format_message(payload)
    if payload.get("kind") == "task":
        return _format_task(payload)
    return _format_agent_card(payload)


def _format_agent_card(payload: dict[str, Any]) -> str:
    lines: list[str] = []

    name = payload.get("name")
    if name:
        lines.append(str(name))

    description = payload.get("description")
    if description:
        lines.append(str(description))

    url = payload.get("url")
    if url:
        lines.append(f"URL: {url}")

    version = payload.get("version")
    if version:
        lines.append(f"Version: {version}")

    preferred_transport = payload.get("preferredTransport")
    if preferred_transport:
        lines.append(f"Transport: {preferred_transport}")

    skills = payload.get("skills")
    if isinstance(skills, list):
        skill_names = [
            str(skill.get("name") or skill.get("id"))
            for skill in skills
            if isinstance(skill, dict) and (skill.get("name") or skill.get("id"))
        ]
        if skill_names:
            lines.append(f"Skills: {', '.join(skill_names)}")

    if lines:
        return "\n".join(lines)

    return json.dumps(payload, ensure_ascii=False, indent=2)


def _format_task(payload: dict[str, Any]) -> str:
    messages = list(_iter_task_messages(payload))
    rendered_messages = _dedupe_rendered_messages(messages)
    if rendered_messages:
        return "\n\n".join(rendered_messages)

    state = payload.get("status", {}).get("state")
    if state:
        return f"Task state: {state}"

    return "(empty task response)"


def _iter_task_messages(payload: dict[str, Any]):
    history = payload.get("history")
    if isinstance(history, list):
        for item in history:
            if isinstance(item, dict) and item.get("kind") == "message":
                yield item

    status = payload.get("status")
    if isinstance(status, dict):
        message = status.get("message")
        if isinstance(message, dict) and message.get("kind") == "message":
            yield message


def _dedupe_rendered_messages(messages: list[dict[str, Any]]) -> list[str]:
    rendered_messages: list[str] = []
    seen_ids: set[str] = set()
    seen_fallback_keys: set[tuple[str | None, str]] = set()

    for message in messages:
        rendered = _format_message(message)
        if not rendered:
            continue

        message_id = message.get("messageId")
        if isinstance(message_id, str) and message_id:
            if message_id in seen_ids:
                continue
            seen_ids.add(message_id)
        else:
            fallback_key = (message.get("role"), rendered)
            if fallback_key in seen_fallback_keys:
                continue
            seen_fallback_keys.add(fallback_key)

        rendered_messages.append(rendered)

    return rendered_messages


def _format_message(payload: dict[str, Any]) -> str:
    body = _format_message_parts(payload.get("parts"))
    if not body:
        return ""

    role = payload.get("role")
    if role and role != "agent":
        return f"[{role}] {body}"
    return body


def _format_message_parts(parts: Any) -> str:
    if not isinstance(parts, list):
        return ""

    rendered_parts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue

        text = part.get("text")
        if isinstance(text, str) and text.strip():
            rendered_parts.append(text.strip())
            continue

        rendered_parts.append(json.dumps(part, ensure_ascii=False, indent=2))

    return "\n\n".join(rendered_parts).strip()


def cli():
    raise SystemExit(asyncio.run(run()))


if __name__ == "__main__":
    cli()
