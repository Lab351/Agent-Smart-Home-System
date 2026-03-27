"""UTC 时间工具测试。"""

from datetime import UTC, datetime

import pytest

from shared.models.a2a_messages import A2AMessage, A2ATask
from pydantic import ValidationError
from shared.utils import utc_now, utc_now_iso


def test_utc_now_iso_returns_zulu_timestamp():
    value = utc_now_iso()

    assert value.endswith("Z")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.tzinfo == UTC


def test_a2a_models_use_timezone_aware_defaults():
    message = A2AMessage()
    task = A2ATask()

    assert message.timestamp.endswith("Z")
    assert task.created_at.endswith("Z")
    assert task.updated_at.endswith("Z")


def test_utc_now_returns_timezone_aware_datetime():
    value = utc_now()

    assert value.tzinfo == UTC


def test_a2a_task_rejects_invalid_status():
    with pytest.raises(ValidationError):
        A2ATask(status="unknown")
