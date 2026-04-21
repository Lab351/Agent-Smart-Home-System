from __future__ import annotations

import sys

from app.server import parse_args


def test_parse_args_defaults_enable_thinking_to_false(monkeypatch) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "serve",
            "--config-path",
            "room.yaml",
            "--llm-config-path",
            "llm.yaml",
        ],
    )

    args = parse_args()

    assert args.enable_thinking is False


def test_parse_args_accepts_enable_thinking_flag(monkeypatch) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "serve",
            "--config-path",
            "room.yaml",
            "--llm-config-path",
            "llm.yaml",
            "--enable-thinking",
        ],
    )

    args = parse_args()

    assert args.enable_thinking is True
