from __future__ import annotations

from config.settings import LLMModelSettings, LLMRole, LLMSettings
from integrations.llm_provider import create_llm_provider, create_llm_provider_registry


def test_create_llm_provider_uses_chat_completions_reasoning_controls() -> None:
    settings = LLMModelSettings(
        role=LLMRole.POWERFUL,
        provider_name="openai",
        model="gpt-5-mini",
        api_key="test-key",
        base_url="https://api.openai.com/v1",
        temperature=0.2,
    )

    without_thinking = create_llm_provider(settings, enable_thinking=False)
    with_thinking = create_llm_provider(settings, enable_thinking=True)

    assert without_thinking is not None
    assert with_thinking is not None
    assert without_thinking.use_responses_api is False
    assert with_thinking.use_responses_api is False
    assert without_thinking.reasoning_effort is None
    assert with_thinking.reasoning_effort == "medium"
    assert without_thinking.reasoning is None
    assert with_thinking.reasoning is None
    assert without_thinking.extra_body is None
    assert with_thinking.extra_body is None


def test_create_llm_provider_uses_dashscope_extra_body_controls() -> None:
    settings = LLMModelSettings(
        role=LLMRole.LOW_COST,
        provider_name="dashscope",
        model="qwen-plus",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        temperature=0.2,
    )

    without_thinking = create_llm_provider(settings, enable_thinking=False)
    with_thinking = create_llm_provider(settings, enable_thinking=True)

    assert without_thinking is not None
    assert with_thinking is not None
    assert without_thinking.use_responses_api is False
    assert with_thinking.use_responses_api is False
    assert without_thinking.extra_body == {"enable_thinking": False}
    assert with_thinking.extra_body == {"enable_thinking": True}
    assert without_thinking.reasoning_effort is None
    assert with_thinking.reasoning_effort is None
    assert without_thinking.reasoning is None
    assert with_thinking.reasoning is None


def test_registry_caches_provider_instances_per_thinking_mode() -> None:
    settings = LLMSettings(
        powerful=LLMModelSettings(
            role=LLMRole.POWERFUL,
            provider_name="openai",
            model="gpt-5",
            api_key="test-key",
            base_url="https://api.openai.com/v1",
            temperature=0.2,
        ),
        low_cost=LLMModelSettings(
            role=LLMRole.LOW_COST,
            provider_name="dashscope",
            model="qwen-plus",
            api_key="test-key",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            temperature=0.2,
        ),
    )

    registry = create_llm_provider_registry(settings)

    low_cost_without_thinking = registry.get(LLMRole.LOW_COST, enable_thinking=False)
    low_cost_without_thinking_again = registry.get(LLMRole.LOW_COST, enable_thinking=False)
    low_cost_with_thinking = registry.get(LLMRole.LOW_COST, enable_thinking=True)

    assert low_cost_without_thinking is low_cost_without_thinking_again
    assert low_cost_without_thinking is not low_cost_with_thinking
    assert low_cost_without_thinking is not None
    assert low_cost_with_thinking is not None
    assert low_cost_without_thinking.use_responses_api is False
    assert low_cost_with_thinking.use_responses_api is False
    assert low_cost_without_thinking.extra_body == {"enable_thinking": False}
    assert low_cost_with_thinking.extra_body == {"enable_thinking": True}
