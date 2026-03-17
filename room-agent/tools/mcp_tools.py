"""High-level MCP tool service for graph nodes."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from integrations.llm_provider import ChatProvider
from integrations.mcp_client import MCPToolClient


class MCPToolDescriptor(BaseModel):
    name: str
    description: str
    args_schema: dict[str, Any]


class MCPToolCallResult(BaseModel):
    success: bool
    tool_name: str | None = None
    result: Any = None
    error: str | None = None
    raw: Any = None


class MCPToolService:
    def __init__(self, client: MCPToolClient | None) -> None:
        self.client = client

    async def list_tools(self) -> list[BaseTool]:
        if self.client is None:
            return []
        return await self.client.get_tools()

    async def describe_tools(self) -> list[MCPToolDescriptor]:
        tools = await self.list_tools()
        return [
            MCPToolDescriptor(
                name=tool.name,
                description=tool.description or "",
                args_schema=getattr(tool, "args", {}) or {},
            )
            for tool in tools
        ]

    async def choose_tool(
        self,
        user_input: str,
        llm_provider: ChatProvider | None = None,
    ) -> MCPToolDescriptor | None:
        descriptors = await self.describe_tools()
        if not descriptors:
            return None

        if llm_provider is not None:
            chosen = await self._choose_with_llm(user_input, descriptors, llm_provider)
            if chosen is not None:
                return chosen

        return _choose_with_heuristic(user_input, descriptors)

    async def invoke_tool(
        self,
        tool_name: str,
        user_input: str,
    ) -> MCPToolCallResult:
        tools = await self.list_tools()
        tool = next((item for item in tools if item.name == tool_name), None)
        if tool is None:
            return MCPToolCallResult(success=False, tool_name=tool_name, error="Tool not found")

        try:
            tool_args = _build_tool_args(tool, user_input)
            raw_result = await tool.ainvoke(tool_args if tool_args else {})
            return MCPToolCallResult(
                success=True,
                tool_name=tool_name,
                result=raw_result,
                raw=raw_result,
            )
        except Exception as exc:
            return MCPToolCallResult(
                success=False,
                tool_name=tool_name,
                error=str(exc),
            )

    async def _choose_with_llm(
        self,
        user_input: str,
        descriptors: list[MCPToolDescriptor],
        llm_provider: ChatProvider,
    ) -> MCPToolDescriptor | None:
        raw_response = await llm_provider.complete_text(
            [
                {
                    "role": "system",
                    "content": (
                        "你是 MCP 工具选择器。只输出 JSON: "
                        '{"tool_name":"从候选工具中选择一个最合适的名字，选不到就返回空字符串"}'
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "user_input": user_input,
                            "tools": [item.model_dump() for item in descriptors],
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0,
            json_mode=True,
        )
        payload = json.loads(raw_response)
        tool_name = payload.get("tool_name")
        if not tool_name:
            return None
        return next((item for item in descriptors if item.name == tool_name), None)


def _choose_with_heuristic(
    user_input: str,
    descriptors: list[MCPToolDescriptor],
) -> MCPToolDescriptor | None:
    if not descriptors:
        return None

    scored: list[tuple[int, MCPToolDescriptor]] = []
    for descriptor in descriptors:
        score = 0
        haystack = f"{descriptor.name} {descriptor.description}".lower()
        for token in _extract_query_tokens(user_input):
            if token in haystack:
                score += max(len(token), 1)
        scored.append((score, descriptor))

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_match = scored[0]
    return best_match if best_score > 0 else None


def _extract_query_tokens(user_input: str) -> list[str]:
    normalized = user_input.lower().strip()
    tokens = [token for token in normalized.replace("？", " ").replace("?", " ").split() if token]
    chinese_keywords = [
        "天气",
        "时间",
        "新闻",
        "搜索",
        "查询",
        "日历",
        "邮件",
        "github",
        "文档",
    ]
    tokens.extend(keyword for keyword in chinese_keywords if keyword in user_input)
    if not tokens:
        tokens.append(normalized)
    return list(dict.fromkeys(tokens))


def _build_tool_args(tool: BaseTool, user_input: str) -> dict[str, Any]:
    args_schema = getattr(tool, "args", {}) or {}
    properties = args_schema if isinstance(args_schema, dict) else {}
    arg_names = list(properties.keys())
    if not arg_names:
        return {}

    aliases = {
        "query",
        "question",
        "input",
        "text",
        "prompt",
        "keyword",
        "location",
        "city",
        "user_input",
    }

    if len(arg_names) == 1:
        return {arg_names[0]: user_input}

    args: dict[str, Any] = {}
    for name in arg_names:
        if name in aliases:
            args[name] = user_input
            break
    if not args:
        args[arg_names[0]] = user_input
    return args
