from pathlib import Path

from config.settings import LLMRole, _load_llm_settings
from integrations.llm_provider import LLMProviderRegistry


def test_load_llm_settings_uses_model_sampling_config():
    fixture_path = Path(__file__).resolve().parents[1] / "fixtures" / "llm.yaml"
    settings = _load_llm_settings(fixture_path)

    assert settings.for_role(LLMRole.POWERFUL).temperature == 0.1
    assert settings.for_role(LLMRole.LOW_COST).temperature == 0.2


def test_registry_falls_back_to_single_available_provider():
    registry = LLMProviderRegistry(powerful="strong-provider", low_cost=None)

    assert registry.get(LLMRole.POWERFUL) == "strong-provider"
    assert registry.get(LLMRole.LOW_COST) == "strong-provider"
