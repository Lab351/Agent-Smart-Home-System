# shared/tests/test_topics.py
"""Topic 工具类单元测试"""

import pytest
from shared.mqtt.topics import TopicBuilder, TopicParser, QoSConfig, SubscriptionTopics


class TestTopicBuilder:
    """TopicBuilder 测试"""

    def test_control_topic(self):
        topic = TopicBuilder.control("livingroom", "room-agent-1")
        assert topic == "room/livingroom/agent/room-agent-1/control"

    def test_state_topic(self):
        topic = TopicBuilder.state("bedroom", "room-agent-2")
        assert topic == "room/bedroom/agent/room-agent-2/state"

    def test_describe_topic(self):
        topic = TopicBuilder.describe("study", "room-agent-3")
        assert topic == "room/study/agent/room-agent-3/describe"

    def test_description_topic(self):
        topic = TopicBuilder.description("livingroom", "room-agent-1")
        assert topic == "room/livingroom/agent/room-agent-1/description"

    def test_heartbeat_topic(self):
        topic = TopicBuilder.heartbeat("bedroom", "room-agent-2")
        assert topic == "room/bedroom/agent/room-agent-2/heartbeat"

    def test_global_state_topic(self):
        topic = TopicBuilder.global_state()
        assert topic == "home/state"

    def test_policy_topic(self):
        topic = TopicBuilder.policy()
        assert topic == "home/policy"

    def test_arbitration_topic(self):
        topic = TopicBuilder.arbitration()
        assert topic == "home/arbitration"

    def test_arbitration_response_topic(self):
        topic = TopicBuilder.arbitration("request-123")
        assert topic == "home/arbitration/response/request-123"

    def test_events_topic(self):
        topic = TopicBuilder.events()
        assert topic == "home/events"


class TestTopicParser:
    """TopicParser 测试"""

    def test_parse_control_topic(self):
        topic = "room/livingroom/agent/room-agent-1/control"
        result = TopicParser.parse(topic)
        
        assert result["type"] == "room"
        assert result["room_id"] == "livingroom"
        assert result["agent_id"] == "room-agent-1"
        assert result["message_type"] == "control"

    def test_parse_state_topic(self):
        topic = "room/bedroom/agent/room-agent-2/state"
        result = TopicParser.parse(topic)
        
        assert result["type"] == "room"
        assert result["room_id"] == "bedroom"
        assert result["message_type"] == "state"

    def test_parse_global_state_topic(self):
        topic = "home/state"
        result = TopicParser.parse(topic)
        
        assert result["type"] == "home"
        assert result["message_type"] == "state"

    def test_parse_arbitration_response_topic(self):
        topic = "home/arbitration/response/request-123"
        result = TopicParser.parse(topic)
        
        assert result["type"] == "home"
        assert result["is_response"] is True
        assert result["request_id"] == "request-123"


class TestQoSConfig:
    """QoSConfig 测试"""

    def test_control_qos(self):
        assert QoSConfig.get_qos("control") == 1

    def test_state_qos(self):
        assert QoSConfig.get_qos("state") == 0

    def test_describe_qos(self):
        assert QoSConfig.get_qos("describe") == 1

    def test_heartbeat_qos(self):
        assert QoSConfig.get_qos("heartbeat") == 0

    def test_global_state_qos(self):
        assert QoSConfig.get_qos("home/state") == 0

    def test_policy_qos(self):
        assert QoSConfig.get_qos("home/policy") == 1

    def test_arbitration_qos(self):
        assert QoSConfig.get_qos("home/arbitration") == 1

    def test_qos_for_topic(self):
        topic = "room/livingroom/agent/room-agent-1/control"
        assert QoSConfig.get_qos_for_topic(topic) == 1


class TestSubscriptionTopics:
    """SubscriptionTopics 测试"""

    def test_personal_agent_topics(self):
        topics = SubscriptionTopics.personal_agent("livingroom")
        
        assert f"room/livingroom/agent/+/state" in topics
        assert f"room/livingroom/agent/+/description" in topics
        assert "home/state" in topics
        assert "home/policy" in topics

    def test_room_agent_topics(self):
        topics = SubscriptionTopics.room_agent("bedroom", "room-agent-1")
        
        assert "room/bedroom/agent/room-agent-1/control" in topics
        assert "room/bedroom/agent/room-agent-1/describe" in topics
        assert "home/policy" in topics

    def test_central_agent_topics(self):
        topics = SubscriptionTopics.central_agent()
        
        assert "room/+/agent/+/state" in topics
        assert "room/+/agent/+/heartbeat" in topics
        assert "home/arbitration" in topics