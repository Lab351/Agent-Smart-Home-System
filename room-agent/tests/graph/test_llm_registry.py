from config.settings import _load_llm_settings
from integrations.llm_provider import LLMProviderRegistry


def test_load_llm_settings_uses_model_sampling_config():
    settings = _load_llm_settings()

    assert settings.for_role("powerful").temperature == 0.1
    assert settings.for_role("low_cost").temperature == 0.2


def test_registry_falls_back_to_single_available_provider():
    registry = LLMProviderRegistry(powerful="strong-provider", low_cost=None)

    assert registry.get("powerful") == "strong-provider"
    assert registry.get("low_cost") == "strong-provider"
