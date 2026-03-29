"""Minimal CLI entrypoint for the LangGraph rebuild."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from app.server import initialize_runtime_dependencies
from config.settings import LLMRole, load_settings
from graph.entry import compile_graph
from integrations.llm_provider import create_llm_provider_registry


async def run_once(
    user_input: str,
    config_path: str | None = None,
    llm_config_path: str | None = None,
) -> dict[str, Any]:
    from integrations.mcp_client import build_home_assistant_mcp_client
    from app.server import probe_home_assistant_mcp

    settings = load_settings(config_path, llm_config_path)
    llm_registry = create_llm_provider_registry(settings.llm)
    if llm_registry.get(LLMRole.LOW_COST) is None:
        raise ValueError(
            "Low-cost LLM provider is unavailable. "
            "Check the llm config and ensure the low_cost role has valid credentials."
        )

    mcp_client = build_home_assistant_mcp_client(settings.agent.home_assistant_mcp)
    mcp_health_status = await probe_home_assistant_mcp(
        mcp_client,
        settings.agent.home_assistant_mcp,
    )

    initialize_runtime_dependencies(
        settings=settings,
        llm_provider_registry=llm_registry,
        mcp_client=mcp_client,
        mcp_health_status=mcp_health_status,
    )
    graph = compile_graph()

    final_state = await graph.ainvoke({"user_input": user_input})
    return final_state


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the rebuilt room-agent graph once.")
    parser.add_argument("user_input", help="User input to send into the graph.")
    parser.add_argument("--config", dest="config_path", required=True, help="YAML config path.")
    parser.add_argument(
        "--llm-config", dest="llm_config_path", required=True, help="LLM config path."
    )
    return parser


def main() -> None:
    args = _build_parser().parse_args()
    result = asyncio.run(
        run_once(
            user_input=args.user_input,
            config_path=args.config_path,
            llm_config_path=args.llm_config_path,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
