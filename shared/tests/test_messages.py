# shared/tests/test_messages.py
"""消息模型单元测试"""

import pytest
from datetime import datetime
from shared.models import (
    ControlMessage,
    StateMessage,
    DescribeMessage,
    DescriptionMessage,
    HeartbeatMessage,
    DeviceState,
    DeviceCapability,
    SystemMetrics,
    GlobalStateMessage,
    PolicyUpdateMessage,
    ArbitrationRequestMessage,
    ArbitrationResponseMessage,
    SystemEventMessage,
)


class TestControlMessage:
    """ControlMessage 测试"""

    def test_create_control_message(self):
        msg = ControlMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            source_agent="personal-agent-user1",
            target_device="light_1",
            action="on",
            parameters={"brightness": 80},
        )
        
        assert msg.message_id == "test-uuid"
        assert msg.target_device == "light_1"
        assert msg.action == "on"
        assert msg.parameters["brightness"] == 80

    def test_control_message_optional_params(self):
        msg = ControlMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            source_agent="personal-agent-user1",
            target_device="light_1",
            action="off",
        )
        
        assert msg.parameters == {}
        assert msg.correlation_id is None


class TestStateMessage:
    """StateMessage 测试"""

    def test_create_state_message(self):
        device = DeviceState(
            device_id="light_1",
            state="on",
            attributes={"brightness": 80},
        )
        
        msg = StateMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            agent_id="room-agent-1",
            devices=[device],
        )
        
        assert msg.agent_id == "room-agent-1"
        assert len(msg.devices) == 1
        assert msg.devices[0].device_id == "light_1"


class TestDescribeMessage:
    """DescribeMessage 测试"""

    def test_create_describe_message(self):
        msg = DescribeMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            source_agent="personal-agent-user1",
            query_type="capabilities",
        )
        
        assert msg.query_type == "capabilities"


class TestDescriptionMessage:
    """DescriptionMessage 测试"""

    def test_create_description_message(self):
        device_cap = DeviceCapability(
            id="light_1",
            name="Main Light",
            type="light",
            actions=["on", "off", "set_brightness"],
        )
        
        msg = DescriptionMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            agent_id="room-agent-1",
            version="1.0.0",
            devices=[device_cap],
            capabilities=["light_control"],
        )
        
        assert msg.agent_id == "room-agent-1"
        assert len(msg.devices) == 1
        assert "light_control" in msg.capabilities


class TestHeartbeatMessage:
    """HeartbeatMessage 测试"""

    def test_create_heartbeat_message(self):
        metrics = SystemMetrics(
            cpu_usage=25.5,
            memory_usage=45.2,
            active_connections=3,
        )
        
        msg = HeartbeatMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            agent_id="room-agent-1",
            uptime_seconds=3600,
            metrics=metrics,
        )
        
        assert msg.agent_id == "room-agent-1"
        assert msg.uptime_seconds == 3600
        assert msg.metrics.cpu_usage == 25.5


class TestGlobalStateMessage:
    """GlobalStateMessage 测试"""

    def test_create_global_state_message(self):
        msg = GlobalStateMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            home_mode="home",
            active_users=["user1", "user2"],
            risk_level="normal",
        )
        
        assert msg.home_mode == "home"
        assert len(msg.active_users) == 2
        assert msg.risk_level == "normal"


class TestPolicyUpdateMessage:
    """PolicyUpdateMessage 测试"""

    def test_create_policy_message(self):
        msg = PolicyUpdateMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            policy_name="sleep_mode",
            rules={"light_max": "low", "noise_max": "minimum"},
            effective_from="2024-01-15T22:00:00Z",
            effective_until="2024-01-16T07:00:00Z",
        )
        
        assert msg.policy_name == "sleep_mode"
        assert msg.rules["light_max"] == "low"


class TestArbitrationMessages:
    """仲裁消息测试"""

    def test_arbitration_request(self):
        msg = ArbitrationRequestMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            requesting_agent="personal-agent-user1",
            conflicting_agents=["personal-agent-user2"],
            conflict_type="multi_user_intent",
            intent={"target_device": "light_1", "action": "on"},
            context={"room_id": "bedroom", "current_mode": "sleep"},
        )
        
        assert msg.requesting_agent == "personal-agent-user1"
        assert msg.conflict_type == "multi_user_intent"

    def test_arbitration_response(self):
        msg = ArbitrationResponseMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            request_id="request-123",
            decision="partial_accept",
            reason="sleep_mode_active",
            suggestion="reduced_brightness",
            modified_action={"target_device": "light_1", "action": "on", "parameters": {"brightness": 20}},
        )
        
        assert msg.decision == "partial_accept"
        assert msg.reason == "sleep_mode_active"


class TestSystemEventMessage:
    """SystemEventMessage 测试"""

    def test_create_event_message(self):
        msg = SystemEventMessage(
            message_id="test-uuid",
            timestamp="2024-01-15T10:30:00Z",
            event_type="mode_switch",
            event_data={"from_mode": "home", "to_mode": "sleep"},
        )
        
        assert msg.event_type == "mode_switch"
        assert msg.event_data["to_mode"] == "sleep"