"""Intent classification node for the rebuilt LangGraph runtime."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from graph.state import GraphState
from integrations.llm_provider import ChatProvider
from graph.nodes.utils.heuristic_classify import heuristic_classify


def build_intent_prompt() -> str:
    return """你是 room-agent 的意图分析节点。

请将用户输入分类为以下三种之一：
1. simple_chat: 闲聊、问候、感谢、自我介绍类问题。
2. task_request + executor_type=mcp: 需要查询外部信息、搜索、天气、时间、知识问答。
3. task_request + executor_type=device: 需要控制房间设备，例如灯、空调、窗帘、风扇、电视。

只输出 JSON，不要输出 Markdown。
JSON 结构：
{
  "intent_type": "simple_chat" | "task_request",
  "response": "仅 simple_chat 时返回简短回复",
  "task_info": {
    "executor_type": "mcp" | "device",
    "task_name": "任务名称",
    "parameters": {
      "user_intent": "归一化后的任务描述",
      "context": {
        "query": "查询或控制目标",
        "location": "房间或位置，没有可留空"
      }
    }
  }
}"""


class IntentClassifierNode:
    def __init__(self, llm_provider: ChatProvider | None) -> None:
        self.llm_provider = llm_provider

    async def __call__(self, state: GraphState) -> GraphState:
        user_input = state["input"]
        result = await self._classify(user_input)
        task_info = result.get("task_info") or {}

        update: GraphState = {
            "intent": {
                "type": result["intent_type"],
                "executor_type": task_info.get("executor_type"),
            },
            "response": result.get("response", ""),
            "trace": [
                {
                    "node": "classify_intent",
                    "event": "classified",
                    "intent_type": result["intent_type"],
                    "executor_type": task_info.get("executor_type"),
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            ],
        }
        if task_info:
            update["task"] = task_info
        return update

    async def _classify(self, user_input: str) -> dict[str, Any]:
        if self.llm_provider is None:
            return heuristic_classify(user_input)

        try:
            raw_response = await self.llm_provider.complete_text(
                [
                    {"role": "system", "content": build_intent_prompt()},
                    {"role": "user", "content": user_input},
                ],
                temperature=0.1,
                json_mode=True,
            )
            parsed = json.loads(raw_response)
            if isinstance(parsed, dict) and parsed.get("intent_type"):
                return parsed
        except Exception:
            pass
        return heuristic_classify(user_input)
