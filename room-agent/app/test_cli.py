"""Minimal CLI entrypoint for the LangGraph rebuild."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from config.settings import LLMRole, load_settings
from graph.builder import build_graph
from graph.state import create_initial_state
from integrations.llm_provider import create_llm_provider_registry
from integrations.mcp_client import build_mcp_client
from tools.mcp_tools import MCPToolService


async def run_once(
    user_input: str,
    session_id: str | None = None,
    request_id: str | None = None,
    config_path: str | None = None,
    llm_config_path: str | None = None,
) -> dict[str, Any]:
    settings = load_settings(config_path, llm_config_path)
    llm_registry = create_llm_provider_registry(settings.llm)
    llm_provider = llm_registry.get(LLMRole.LOW_COST)
    mcp_client = build_mcp_client(settings.runtime.mcp_config_path)
    graph = build_graph(llm_provider, MCPToolService(mcp_client))

    final_state = await graph.ainvoke(
        create_initial_state(
            user_input=user_input,
            session_id=session_id,
            request_id=request_id,
        )
    )
    return final_state["result"]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the rebuilt room-agent graph once.")
    parser.add_argument("user_input", help="User input to send into the graph.")
    parser.add_argument("--session-id", dest="session_id", help="Optional session id.")
    parser.add_argument("--request-id", dest="request_id", help="Optional request id.")
    parser.add_argument("--config", dest="config_path", required=True, help="YAML config path.")
    parser.add_argument("--llm-config", dest="llm_config_path", required=True, help="LLM config path.")
    return parser


def main() -> None:
    args = _build_parser().parse_args()
    result = asyncio.run(
        run_once(
            user_input=args.user_input,
            session_id=args.session_id,
            request_id=args.request_id,
            config_path=args.config_path,
            llm_config_path=args.llm_config_path,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
