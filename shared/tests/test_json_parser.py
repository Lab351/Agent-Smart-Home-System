"""Tests for shared JSON parsing utilities."""

from __future__ import annotations

import asyncio

import pytest

from shared.llm.json_parser import JsonRepairError, parse_json_with_repair


class RepairProvider:
    def __init__(self, repaired_text: str) -> None:
        self.repaired_text = repaired_text

    async def complete_text(self, messages, *, temperature=0.2, json_mode=False):
        assert json_mode is True
        assert messages
        return self.repaired_text


def test_parse_json_direct_success():
    parsed = asyncio.run(parse_json_with_repair('{"ok": true, "count": 1}'))

    assert parsed == {"ok": True, "count": 1}


def test_parse_json_with_code_fence():
    parsed = asyncio.run(parse_json_with_repair('```json\n{"ok": true}\n```'))

    assert parsed == {"ok": True}


def test_parse_json_uses_llm_repair_when_direct_parse_fails():
    provider = RepairProvider('{"intent_name": "chat", "need_tool_call": false}')
    schema = {
        "type": "object",
        "properties": {
            "intent_name": {"type": "string"},
            "need_tool_call": {"type": "boolean"},
        },
        "required": ["intent_name", "need_tool_call"],
        "additionalProperties": False,
    }

    parsed = asyncio.run(
        parse_json_with_repair(
            "{intent_name: chat",
            llm_provider=provider,
            schema=schema,
        )
    )

    assert parsed == {"intent_name": "chat", "need_tool_call": False}


def test_parse_json_uses_library_repair_for_python_style_json():
    parsed = asyncio.run(parse_json_with_repair("{'ok': True, 'value': None,}"))

    assert parsed == {"ok": True, "value": "None"}


def test_parse_json_uses_library_repair_for_wrapped_json_text():
    parsed = asyncio.run(parse_json_with_repair('结果如下：{"ok": true, "count": 2} 请查收'))

    assert parsed == {"ok": True, "count": 2}


def test_parse_json_validates_schema_after_repair():
    provider = RepairProvider('{"intent_name": "chat", "need_tool_call": false}')
    schema = {
        "type": "object",
        "properties": {
            "intent_name": {"type": "string"},
            "need_tool_call": {"type": "boolean"},
        },
        "required": ["intent_name", "need_tool_call"],
        "additionalProperties": False,
    }

    parsed = asyncio.run(
        parse_json_with_repair("{intent_name: chat", llm_provider=provider, schema=schema)
    )

    assert parsed["intent_name"] == "chat"
    assert parsed["need_tool_call"] is False


def test_parse_json_raises_when_no_repair_provider():
    schema = {
        "type": "object",
        "properties": {
            "intent_name": {"type": "string"},
            "need_tool_call": {"type": "boolean"},
        },
        "required": ["intent_name", "need_tool_call"],
        "additionalProperties": False,
    }

    with pytest.raises(JsonRepairError):
        asyncio.run(parse_json_with_repair("hello world", schema=schema))
