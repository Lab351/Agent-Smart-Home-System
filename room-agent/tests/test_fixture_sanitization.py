from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRACKED_TEMPLATE_FILES = [
    ROOT / ".env.example",
    ROOT / "config" / "examples" / "room_agent.example.yaml",
    ROOT / "config" / "examples" / "llm.example.yaml",
    ROOT / "README.md",
    ROOT / "config" / "README.md",
    ROOT / "docs" / "ARCHITECTURE.md",
    ROOT / "tests" / "README.md",
    ROOT / "app" / "server.py",
]
JWT_LIKE_TOKEN = re.compile(r"eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+")
REAL_OPENAI_STYLE_KEY = re.compile(r"sk-(?!x{8,})([A-Za-z0-9_-]{12,})")
PUBLIC_TEST_ENDPOINTS = (
    "ha.scut.mcurobot.com",
    "121.37.194.185",
)


def test_tracked_fixtures_do_not_contain_live_like_tokens_or_public_endpoints() -> None:
    for tracked_path in TRACKED_TEMPLATE_FILES:
        assert tracked_path.exists(), f"Expected tracked template/documentation file at {tracked_path}"
        content = tracked_path.read_text(encoding="utf-8")

        assert JWT_LIKE_TOKEN.search(content) is None, f"JWT-like token leaked in {tracked_path}"
        assert (
            REAL_OPENAI_STYLE_KEY.search(content) is None
        ), f"API key-like secret leaked in {tracked_path}"
        for endpoint in PUBLIC_TEST_ENDPOINTS:
            assert endpoint not in content, f"Public endpoint leaked in {tracked_path}"
