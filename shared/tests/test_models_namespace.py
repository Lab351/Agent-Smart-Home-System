"""共享模型命名空间边界测试。"""

import shared.models as shared_models


def test_shared_models_exports_only_unambiguous_symbols():
    assert hasattr(shared_models, "AgentCard")
    assert hasattr(shared_models, "A2AMessage")
    assert hasattr(shared_models, "DescribeMessage")

    assert not hasattr(shared_models, "ControlMessage")
    assert not hasattr(shared_models, "DescriptionMessage")
    assert not hasattr(shared_models, "DeviceCapability")
    assert not hasattr(shared_models, "DeviceState")
