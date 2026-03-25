#!/usr/bin/env python3
"""Minimal A2A debug client for local service testing."""

from __future__ import annotations

import argparse
import asyncio
import json
from uuid import uuid4

import httpx
from a2a.client import A2ACardResolver, ClientConfig, ClientFactory
from a2a.client.helpers import create_text_message_object
from a2a.types import Message, MessageSendConfiguration, Task, TaskQueryParams


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Debug an A2A service by resolving its agent card and sending JSON-RPC requests.",
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
            print(json.dumps(agent_card.model_dump(mode="json", by_alias=True), ensure_ascii=False, indent=2))
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
            print(
                json.dumps(
                    response.model_dump(mode="json", by_alias=True, exclude_none=True),
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0

        if args.command == "get-task":
            response = await client.get_task(
                TaskQueryParams(
                    id=args.task_id,
                    history_length=args.history_length,
                )
            )
            print(
                json.dumps(
                    response.model_dump(mode="json", by_alias=True, exclude_none=True),
                    ensure_ascii=False,
                    indent=2,
                )
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


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
