import pytest

from graph.nodes.classify_intent import IntentClassifierNode
from graph.nodes.task_router import route_after_classification
from graph.nodes.utils.heuristic_classify import heuristic_classify


def test_heuristic_classify_simple_chat():
    result = heuristic_classify("你好")

    assert result["intent_type"] == "simple_chat"
    assert result["response"]


def test_heuristic_classify_device_request():
    result = heuristic_classify("打开卧室的灯")

    assert result["intent_type"] == "task_request"
    assert result["task_info"]["executor_type"] == "device"


def test_route_after_classification_device():
    route = route_after_classification(
        {
            "intent": {
                "type": "task_request",
                "executor_type": "device",
            }
        }
    )

    assert route == "device"


class NullTaskInfoProvider:
    async def complete_text(self, messages, *, temperature=0.2, json_mode=False):
        return (
            '{"intent_type":"simple_chat","response":"我是 room-agent。",'
            '"task_info":null}'
        )


@pytest.mark.asyncio
async def test_classifier_handles_null_task_info_from_llm():
    node = IntentClassifierNode(NullTaskInfoProvider())

    result = await node(
        {
            "run_id": "run-1",
            "request_id": "req-1",
            "session_id": "session-1",
            "input": "你好啊你是谁",
            "trace": [],
        }
    )

    assert result["intent"]["type"] == "simple_chat"
    assert result["intent"]["executor_type"] is None
    assert result["response"] == "我是 room-agent。"
    assert "task" not in result
