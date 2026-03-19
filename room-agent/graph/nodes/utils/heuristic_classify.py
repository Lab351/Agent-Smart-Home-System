"""Heuristic intent classification helpers."""

from __future__ import annotations

from typing import Any


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
