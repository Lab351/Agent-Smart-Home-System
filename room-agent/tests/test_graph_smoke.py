from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from openai import APIConnectionError

from app.server import initialize_runtime_dependencies
from config.settings import load_settings
from graph.entry import compile_graph
from integrations.llm_provider import create_llm_provider_registry


ROOT = Path(__file__).resolve().parents[1]
ROOM_AGENT_CONFIG = ROOT / "config" / "examples" / "room_agent.example.yaml"
LLM_CONFIG = Path(__file__).resolve().parent / "fixtures" / "llm.yaml"


def _require_llm_fixture() -> None:
    if not LLM_CONFIG.exists():
        pytest.skip(
            "Missing room-agent/tests/fixtures/llm.yaml. "
            "Create it locally from room-agent/config/examples/llm.example.yaml "
            "and fill in real provider credentials for the low_cost and powerful roles."
        )


def _initialize_real_runtime() -> None:
    _require_llm_fixture()
    settings = load_settings(
        config_path=str(ROOM_AGENT_CONFIG),
        llm_config_path=str(LLM_CONFIG),
    )
    registry = create_llm_provider_registry(settings.llm)
    initialize_runtime_dependencies(
        settings=settings,
        llm_provider_registry=registry,
    )


def _invoke_graph_or_skip(user_input: str) -> dict[str, object]:
    try:
        return asyncio.run(compile_graph().ainvoke({"user_input": user_input}))
    except APIConnectionError as exc:
        pytest.skip(f"Skipping smoke test because upstream LLM is unreachable: {exc}")


def test_graph_routes_chat_to_direct_response():
    _initialize_real_runtime()

    final_state = _invoke_graph_or_skip("你好")

    assert final_state["need_tool_call"] is False
    assert final_state["next_action"] == "direct_response"
    assert final_state["execution_result"]["type"] == "text"
    assert final_state["execution_result"]["message"]


def test_graph_routes_tool_request_to_tool_selection():
    _initialize_real_runtime()

    final_state = _invoke_graph_or_skip("帮我打开卧室的灯")

    assert final_state["need_tool_call"] is True
    assert final_state["next_action"] == "agent_execution"
    assert "message" in final_state["execution_result"]
