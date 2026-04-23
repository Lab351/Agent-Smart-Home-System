from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.server import DIRECT_EXECUTION_ERROR, parse_args


REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_PATH = REPO_ROOT / "room-agent" / "app" / "server.py"


def test_direct_script_execution_fails_fast_with_clear_message() -> None:
    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert DIRECT_EXECUTION_ERROR in result.stderr


def test_parse_args_accepts_explicit_lan_bind_host_and_port() -> None:
    args = parse_args(
        [
            "--config-path",
            "room.yaml",
            "--llm-config-path",
            "llm.yaml",
            "--host",
            "0.0.0.0",
            "--port",
            "10001",
        ],
        environ={},
    )

    assert args.config_path == "room.yaml"
    assert args.llm_config_path == "llm.yaml"
    assert args.host == "0.0.0.0"
    assert args.port == 10001


def test_parse_args_uses_bind_environment_defaults() -> None:
    args = parse_args(
        [
            "--config-path",
            "room.yaml",
            "--llm-config-path",
            "llm.yaml",
        ],
        environ={"ROOM_AGENT_HOST": "0.0.0.0", "ROOM_AGENT_PORT": "10002"},
    )

    assert args.host == "0.0.0.0"
    assert args.port == 10002
