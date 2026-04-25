from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from shared.observability import (  # noqa: E402
    LLMUsageRecord,
    ObservabilityConfig,
    ObservabilityRecorder,
    TraceContext,
    get_current_trace,
    observe_stage,
    reset_current_trace,
    set_current_trace,
)
from shared.utils import utc_now_iso  # noqa: E402


_HOME_RECORDER: ObservabilityRecorder | None = None


def initialize_home_observability(
    *,
    agent_id: str,
    agent_type: str,
    service_name: str = "home-agent",
) -> ObservabilityRecorder:
    global _HOME_RECORDER
    if _HOME_RECORDER is None:
        _HOME_RECORDER = ObservabilityRecorder(
            service_name=service_name,
            agent_id=agent_id,
            agent_type=agent_type,
            config=ObservabilityConfig(),
        )
    return _HOME_RECORDER


def get_home_observability() -> ObservabilityRecorder | None:
    return _HOME_RECORDER


@contextmanager
def home_trace(
    *,
    agent_id: str,
    agent_type: str,
    service_name: str,
    trace_id: str | None = None,
    task_id: str | None = None,
    context_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Iterator[TraceContext]:
    trace_context = TraceContext(
        trace_id=trace_id or str(uuid4()),
        task_id=task_id,
        context_id=context_id,
        agent_id=agent_id,
        agent_type=agent_type,
        service_name=service_name,
        metadata=dict(metadata or {}),
    )
    token = set_current_trace(trace_context)
    try:
        yield trace_context
    finally:
        reset_current_trace(token)


def record_home_llm_usage(
    *,
    stage: str,
    model: str,
    provider: str,
    usage: dict[str, int] | None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    recorder = get_home_observability()
    trace_context = get_current_trace()
    if recorder is None or trace_context is None or not usage:
        return None

    prompt_tokens = int(usage.get("prompt_tokens", 0))
    completion_tokens = int(usage.get("completion_tokens", 0))
    total_tokens = int(usage.get("total_tokens", prompt_tokens + completion_tokens))
    timestamp = utc_now_iso()
    cost = recorder.estimate_cost(
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    record = LLMUsageRecord(
        trace_id=trace_context.trace_id,
        task_id=trace_context.task_id,
        context_id=trace_context.context_id,
        agent_id=trace_context.agent_id,
        agent_type=trace_context.agent_type,
        service_name=trace_context.service_name,
        stage=stage,
        started_at=timestamp,
        ended_at=timestamp,
        duration_ms=0.0,
        success=True,
        model=model,
        provider=provider,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated=False,
        cost=cost,
        metadata=dict(metadata or {}),
    )
    recorder.record_llm_usage(record)
    return record.model_dump(mode="json")
