from __future__ import annotations

from graph.utils.prompt_patch import maybe_apply_qwen_nothink


def test_maybe_apply_qwen_nothink_disabled(monkeypatch) -> None:
    monkeypatch.delenv("__RA_QWEN_NOTHINK", raising=False)

    assert maybe_apply_qwen_nothink("  hello  ") == "hello"


def test_maybe_apply_qwen_nothink_enabled(monkeypatch) -> None:
    monkeypatch.setenv("__RA_QWEN_NOTHINK", "true")

    assert maybe_apply_qwen_nothink("hello") == "hello/nothink"


def test_maybe_apply_qwen_nothink_no_duplicate_suffix(monkeypatch) -> None:
    monkeypatch.setenv("__RA_QWEN_NOTHINK", "1")

    assert maybe_apply_qwen_nothink("hello/nothink") == "hello/nothink"