"""Minimal A2A JSON-RPC mock server for local client experiments.

This does not implement the full protocol. It is only meant to exercise:
1. Agent Card discovery
2. message/send
3. tasks/get
"""

from __future__ import annotations

import argparse
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class TaskStore:
    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create_task(self, text: str) -> dict[str, Any]:
        task_id = str(uuid.uuid4())
        created_at = time.time()
        slow = "slow" in text.lower() or "慢" in text
        failed = "fail" in text.lower() or "失败" in text
        task = {
            "id": task_id,
            "kind": "task",
            "contextId": task_id,
            "history": [
                {
                    "kind": "message",
                    "messageId": str(uuid.uuid4()),
                    "role": "user",
                    "parts": [{"kind": "text", "text": text}],
                }
            ],
            "status": {
                "state": "failed" if failed else ("working" if slow else "completed"),
                "timestamp": now_iso(),
                "message": {
                    "kind": "message",
                    "messageId": str(uuid.uuid4()),
                    "role": "agent",
                    "parts": [
                        {
                            "kind": "text",
                            "text": "Mock A2A request failed"
                            if failed
                            else "Mock A2A server is processing your request..."
                            if slow
                            else f"Mock A2A reply: {text}",
                        }
                    ],
                },
            },
            "artifacts": [],
            "_slow": slow,
            "_failed": failed,
            "_created_at": created_at,
            "_original_text": text,
        }
        with self._lock:
            self._tasks[task_id] = task
        return self._public_task(task)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None

            if task["_slow"] and time.time() - task["_created_at"] > 2.0:
                task["status"] = {
                    "state": "completed",
                    "timestamp": now_iso(),
                    "message": {
                        "kind": "message",
                        "messageId": str(uuid.uuid4()),
                        "role": "agent",
                        "parts": [
                            {
                                "kind": "text",
                                "text": f"Mock A2A completed: {task['_original_text']}",
                            }
                        ],
                    },
                }
                task["artifacts"] = [
                    {
                        "artifactId": str(uuid.uuid4()),
                        "name": "final-response",
                        "parts": [
                            {
                                "kind": "text",
                                "text": f"Mock artifact for: {task['_original_text']}",
                            }
                        ],
                    }
                ]
                task["_slow"] = False

            return self._public_task(task)

    def _public_task(self, task: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": task["id"],
            "kind": task["kind"],
            "contextId": task["contextId"],
            "status": task["status"],
            "history": task["history"],
            "artifacts": task["artifacts"],
        }


class MockA2ARequestHandler(BaseHTTPRequestHandler):
    store = TaskStore()

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/.well-known/agent-card.json":
            self._send_json(
                200,
                {
                    "name": "Mock Room Agent",
                    "description": "Local mock A2A server for personal-agent client tests",
                    "protocolVersion": "0.3.0",
                    "version": "0.1.0",
                    "url": f"http://{self.server.server_address[0]}:{self.server.server_address[1]}/a2a/jsonrpc",
                    "capabilities": {
                        "streaming": False,
                        "pushNotifications": False,
                    },
                    "defaultInputModes": ["text"],
                    "defaultOutputModes": ["text"],
                    "skills": [
                        {
                            "id": "device-control",
                            "name": "Device Control",
                            "description": "Accepts control-style text requests",
                            "tags": ["control", "room"],
                        }
                    ],
                },
            )
            return

        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/a2a/jsonrpc":
            self._send_json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(
                400,
                {
                    "jsonrpc": "2.0",
                    "error": {"code": -32700, "message": "Invalid JSON payload"},
                    "id": None,
                },
            )
            return

        method = payload.get("method")
        request_id = payload.get("id")
        params = payload.get("params") or {}

        if method == "message/send":
            result = self._handle_message_send(params)
            self._send_json(200, {"jsonrpc": "2.0", "id": request_id, "result": result})
            return

        if method == "tasks/get":
            task_id = params.get("id")
            task = self.store.get_task(task_id)
            if task is None:
                self._send_json(
                    404,
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {"code": -32001, "message": f"Task not found: {task_id}"},
                    },
                )
                return

            self._send_json(200, {"jsonrpc": "2.0", "id": request_id, "result": task})
            return

        self._send_json(
            400,
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            },
        )

    def _handle_message_send(self, params: dict[str, Any]) -> dict[str, Any]:
        message = params.get("message") or {}
        parts = message.get("parts") or []
        text_parts: list[str] = []

        for part in parts:
            part_kind = part.get("kind")
            if part_kind == "text":
                text_parts.append(part.get("text", ""))
                continue

            if part_kind == "data":
                data = part.get("data") or {}
                if data.get("kind") == "control_request":
                    text_parts.append(
                        " ".join(
                            [
                                "control_request",
                                data.get("roomId", ""),
                                data.get("targetDevice", ""),
                                data.get("action", ""),
                            ]
                        ).strip()
                    )
                else:
                    text_parts.append(json.dumps(data, ensure_ascii=False))

        text = "\n".join([part for part in text_parts if part]).strip()
        if not text:
            text = "empty request"
        return self.store.create_task(text)

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local mock A2A server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4040)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), MockA2ARequestHandler)
    print(f"Mock A2A server listening on http://{args.host}:{args.port}")
    print(f"Agent card: http://{args.host}:{args.port}/.well-known/agent-card.json")
    print(f"JSON-RPC:   http://{args.host}:{args.port}/a2a/jsonrpc")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
