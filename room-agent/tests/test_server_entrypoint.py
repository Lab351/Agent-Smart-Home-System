from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.server import DIRECT_EXECUTION_ERROR


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
