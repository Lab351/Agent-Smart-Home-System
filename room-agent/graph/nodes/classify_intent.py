"""Intent classification node for the rebuilt LangGraph runtime."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from graph.state import GraphState
from integrations.llm_provider import ChatProvider


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


def heuristic_classify(user_input: str) -> dict[str, Any]:
    normalized = user_input.strip()
    lowered = normalized.lower()

    simple_chat_pairs = [
        ("你好", "你好，我在。"),
        ("hello", "你好，我在。"),
        ("hi", "你好，我在。"),
        ("谢谢", "不客气。"),
        ("你是谁", "我是 room-agent，目前负责房间任务路由。"),
    ]
    for keyword, response in simple_chat_pairs:
        if keyword in lowered or keyword in normalized:
            return {
                "intent_type": "simple_chat",
                "response": response,
            }

    device_verbs = ("打开", "关闭", "调高", "调低", "调亮", "调暗", "设置", "启动", "停止")
    device_nouns = ("灯", "空调", "窗帘", "风扇", "电视", "humidifier", "light")
    if any(verb in normalized for verb in device_verbs) and any(
        noun in lowered or noun in normalized for noun in device_nouns
    ):
        return {
            "intent_type": "task_request",
            "task_info": {
                "executor_type": "device",
                "task_name": "device_control",
                "parameters": {
                    "user_intent": normalized,
                    "context": {
                        "query": normalized,
                        "location": "",
                    },
                },
            },
        }

    mcp_keywords = ("天气", "搜索", "查询", "查一下", "新闻", "时间", "几点", "百科")
    if any(keyword in normalized for keyword in mcp_keywords):
        return {
            "intent_type": "task_request",
            "task_info": {
                "executor_type": "mcp",
                "task_name": "mcp_request",
                "parameters": {
                    "user_intent": normalized,
                    "context": {
                        "query": normalized,
                        "location": "",
                    },
                },
            },
        }

    return {
        "intent_type": "simple_chat",
        "response": "我先理解成普通对话。你也可以直接告诉我想查什么，或者要控制哪个设备。",
    }


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
