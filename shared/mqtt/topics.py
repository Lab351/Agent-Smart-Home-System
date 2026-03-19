"""兼容层：基于 ``TopicManager`` 的旧 Topic 工具 API。"""

from typing import Optional

from shared.mqtt.topic_manager import TopicManager, TopicType


_TOPIC_MANAGER = TopicManager()


class TopicBuilder:
    """Topic 构建器兼容封装。"""

    @staticmethod
    def control(room_id: str, agent_id: str) -> str:
        return _TOPIC_MANAGER.build_control_topic(room_id, agent_id)

    @staticmethod
    def state(room_id: str, agent_id: str) -> str:
        return _TOPIC_MANAGER.build_state_topic(room_id, agent_id)

    @staticmethod
    def describe(room_id: str, agent_id: str) -> str:
        return _TOPIC_MANAGER.build_describe_topic(room_id, agent_id)

    @staticmethod
    def description(room_id: str, agent_id: str) -> str:
        return _TOPIC_MANAGER.build_description_topic(room_id, agent_id)

    @staticmethod
    def heartbeat(room_id: str, agent_id: str) -> str:
        return _TOPIC_MANAGER.build_heartbeat_topic(room_id, agent_id)

    @staticmethod
    def global_state() -> str:
        return _TOPIC_MANAGER.build_global_state_topic()

    @staticmethod
    def policy() -> str:
        return _TOPIC_MANAGER.build_policy_topic()

    @staticmethod
    def arbitration(request_id: Optional[str] = None) -> str:
        if request_id:
            return _TOPIC_MANAGER.build_arbitration_response_topic(request_id)
        return _TOPIC_MANAGER.build_arbitration_topic()

    @staticmethod
    def events() -> str:
        return _TOPIC_MANAGER.build_events_topic()

    @staticmethod
    def system_discovery(room_id: str) -> str:
        return f"room/{room_id}/system/discovery"

    @staticmethod
    def system_error(room_id: str) -> str:
        return f"room/{room_id}/system/error"


class TopicParser:
    """Topic 解析器兼容封装。"""

    @staticmethod
    def parse(topic: str) -> dict:
        info = _TOPIC_MANAGER.parse_topic(topic)
        if info is None:
            return {}

        message_type_map = {
            TopicType.GLOBAL_STATE: "state",
            TopicType.ARBITRATION_RESPONSE: "arbitration",
        }

        result = {
            "type": info.scope,
            "room_id": info.room_id,
            "agent_id": info.agent_id,
            "message_type": message_type_map.get(info.topic_type, info.topic_type.value),
        }

        if info.topic_type == TopicType.ARBITRATION_RESPONSE:
            result["is_response"] = True
            result["request_id"] = info.correlation_id

        return result


class QoSConfig:
    """QoS 配置兼容封装。"""

    QOS_MAP = {
        "control": TopicType.CONTROL,
        "state": TopicType.STATE,
        "describe": TopicType.DESCRIBE,
        "description": TopicType.DESCRIPTION,
        "heartbeat": TopicType.HEARTBEAT,
        "home/state": TopicType.GLOBAL_STATE,
        "home/policy": TopicType.POLICY,
        "home/arbitration": TopicType.ARBITRATION,
        "home/arbitration/response": TopicType.ARBITRATION_RESPONSE,
        "home/events": TopicType.EVENTS,
    }

    @classmethod
    def get_qos(cls, message_type: str) -> int:
        topic_type = cls.QOS_MAP.get(message_type)
        if topic_type is None:
            return 0
        return _TOPIC_MANAGER.get_qos_for_topic(topic_type)

    @classmethod
    def get_qos_for_topic(cls, topic: str) -> int:
        info = _TOPIC_MANAGER.parse_topic(topic)
        if info is None:
            return 0
        return _TOPIC_MANAGER.get_qos_for_topic(info.topic_type)


class SubscriptionTopics:
    """订阅 Topic 模式兼容封装。"""

    @staticmethod
    def personal_agent(room_id: str) -> list[str]:
        return [
            _TOPIC_MANAGER.build_wildcard_topic(room_id, TopicType.STATE),
            _TOPIC_MANAGER.build_wildcard_topic(room_id, TopicType.DESCRIPTION),
            _TOPIC_MANAGER.build_global_state_topic(),
            _TOPIC_MANAGER.build_policy_topic(),
            "home/arbitration/response/+",
        ]

    @staticmethod
    def room_agent(room_id: str, agent_id: str) -> list[str]:
        return [
            _TOPIC_MANAGER.build_control_topic(room_id, agent_id),
            _TOPIC_MANAGER.build_describe_topic(room_id, agent_id),
            _TOPIC_MANAGER.build_policy_topic(),
        ]

    @staticmethod
    def central_agent() -> list[str]:
        return [
            "room/+/agent/+/state",
            "room/+/agent/+/heartbeat",
            _TOPIC_MANAGER.build_arbitration_topic(),
        ]
