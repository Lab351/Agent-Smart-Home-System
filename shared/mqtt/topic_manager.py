# shared/mqtt/topic_manager.py
"""MQTT Topic 管理器

负责构建、解析和验证 MQTT topic，符合 docs/communication.md 规范
"""

from typing import Optional, NamedTuple
from enum import Enum


class AgentType(str, Enum):
    """Agent 类型枚举"""
    PERSONAL = "personal"
    ROOM = "room"
    CENTRAL = "central"


class TopicType(str, Enum):
    """Topic 类型枚举"""
    # Room Agent Topics
    CONTROL = "control"
    STATE = "state"
    DESCRIBE = "describe"
    DESCRIPTION = "description"
    HEARTBEAT = "heartbeat"
    
    # Central Agent Topics
    GLOBAL_STATE = "global_state"
    POLICY = "policy"
    ARBITRATION = "arbitration"
    ARBITRATION_RESPONSE = "arbitration_response"
    EVENTS = "events"


class TopicInfo(NamedTuple):
    """解析后的 Topic 信息"""
    scope: str  # "room" or "home"
    room_id: Optional[str]
    agent_id: Optional[str]
    topic_type: TopicType
    correlation_id: Optional[str] = None  # 用于响应 topic


class TopicManager:
    """MQTT Topic 管理器
    
    提供统一的 topic 构建和解析接口，确保符合通信协议规范
    
    Examples:
        >>> tm = TopicManager()
        >>> tm.build_control_topic("bedroom_01", "room-agent-bedroom")
        'room/bedroom_01/agent/room-agent-bedroom/control'
        
        >>> tm.parse_topic("room/bedroom_01/agent/room-agent-bedroom/control")
        TopicInfo(scope='room', room_id='bedroom_01', ...)
    """
    
    # Topic 前缀
    ROOM_PREFIX = "room"
    HOME_PREFIX = "home"
    AGENT_PREFIX = "agent"
    
    # Room Agent Topic 模板
    ROOM_TOPIC_TEMPLATES = {
        TopicType.CONTROL: "{room_prefix}/{room_id}/{agent_prefix}/{agent_id}/control",
        TopicType.STATE: "{room_prefix}/{room_id}/{agent_prefix}/{agent_id}/state",
        TopicType.DESCRIBE: "{room_prefix}/{room_id}/{agent_prefix}/{agent_id}/describe",
        TopicType.DESCRIPTION: "{room_prefix}/{room_id}/{agent_prefix}/{agent_id}/description",
        TopicType.HEARTBEAT: "{room_prefix}/{room_id}/{agent_prefix}/{agent_id}/heartbeat",
    }
    
    # Central Agent Topic 模板
    HOME_TOPIC_TEMPLATES = {
        TopicType.GLOBAL_STATE: "home/state",
        TopicType.POLICY: "home/policy",
        TopicType.ARBITRATION: "home/arbitration",
        TopicType.ARBITRATION_RESPONSE: "home/arbitration/response/{correlation_id}",
        TopicType.EVENTS: "home/events",
    }
    
    def build_control_topic(self, room_id: str, agent_id: str) -> str:
        """构建控制命令 topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 字符串，如: room/bedroom_01/agent/room-agent-bedroom/control
        """
        return self.ROOM_TOPIC_TEMPLATES[TopicType.CONTROL].format(
            room_prefix=self.ROOM_PREFIX,
            room_id=room_id,
            agent_prefix=self.AGENT_PREFIX,
            agent_id=agent_id
        )
    
    def build_state_topic(self, room_id: str, agent_id: str) -> str:
        """构建状态发布 topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 字符串，如: room/bedroom_01/agent/room-agent-bedroom/state
        """
        return self.ROOM_TOPIC_TEMPLATES[TopicType.STATE].format(
            room_prefix=self.ROOM_PREFIX,
            room_id=room_id,
            agent_prefix=self.AGENT_PREFIX,
            agent_id=agent_id
        )
    
    def build_describe_topic(self, room_id: str, agent_id: str) -> str:
        """构建能力查询 topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 字符串，如: room/bedroom_01/agent/room-agent-bedroom/describe
        """
        return self.ROOM_TOPIC_TEMPLATES[TopicType.DESCRIBE].format(
            room_prefix=self.ROOM_PREFIX,
            room_id=room_id,
            agent_prefix=self.AGENT_PREFIX,
            agent_id=agent_id
        )
    
    def build_description_topic(self, room_id: str, agent_id: str) -> str:
        """构建能力描述响应 topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 字符串，如: room/bedroom_01/agent/room-agent-bedroom/description
        """
        return self.ROOM_TOPIC_TEMPLATES[TopicType.DESCRIPTION].format(
            room_prefix=self.ROOM_PREFIX,
            room_id=room_id,
            agent_prefix=self.AGENT_PREFIX,
            agent_id=agent_id
        )
    
    def build_heartbeat_topic(self, room_id: str, agent_id: str) -> str:
        """构建心跳 topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 字符串，如: room/bedroom_01/agent/room-agent-bedroom/heartbeat
        """
        return self.ROOM_TOPIC_TEMPLATES[TopicType.HEARTBEAT].format(
            room_prefix=self.ROOM_PREFIX,
            room_id=room_id,
            agent_prefix=self.AGENT_PREFIX,
            agent_id=agent_id
        )
    
    def build_global_state_topic(self) -> str:
        """构建全局状态 topic
        
        Returns:
            Topic 字符串: home/state
        """
        return self.HOME_TOPIC_TEMPLATES[TopicType.GLOBAL_STATE]
    
    def build_policy_topic(self) -> str:
        """构建策略更新 topic
        
        Returns:
            Topic 字符串: home/policy
        """
        return self.HOME_TOPIC_TEMPLATES[TopicType.POLICY]
    
    def build_arbitration_topic(self) -> str:
        """构建仲裁请求 topic
        
        Returns:
            Topic 字符串: home/arbitration
        """
        return self.HOME_TOPIC_TEMPLATES[TopicType.ARBITRATION]
    
    def build_arbitration_response_topic(self, correlation_id: str) -> str:
        """构建仲裁响应 topic
        
        Args:
            correlation_id: 关联 ID（请求 ID）
            
        Returns:
            Topic 字符串，如: home/arbitration/response/req-123
        """
        return self.HOME_TOPIC_TEMPLATES[TopicType.ARBITRATION_RESPONSE].format(
            correlation_id=correlation_id
        )
    
    def build_events_topic(self) -> str:
        """构建系统事件 topic
        
        Returns:
            Topic 字符串: home/events
        """
        return self.HOME_TOPIC_TEMPLATES[TopicType.EVENTS]
    
    def build_wildcard_topic(self, room_id: str, topic_type: TopicType) -> str:
        """构建通配符 topic（用于订阅）
        
        Args:
            room_id: 房间 ID
            topic_type: Topic 类型
            
        Returns:
            通配符 topic，如: room/bedroom_01/agent/+/control
        """
        if topic_type in self.ROOM_TOPIC_TEMPLATES:
            template = self.ROOM_TOPIC_TEMPLATES[topic_type]
            return template.format(
                room_prefix=self.ROOM_PREFIX,
                room_id=room_id,
                agent_prefix=self.AGENT_PREFIX,
                agent_id="+"  # MQTT 通配符
            )
        else:
            raise ValueError(f"Invalid topic type for room: {topic_type}")
    
    def parse_topic(self, topic: str) -> Optional[TopicInfo]:
        """解析 topic 字符串，提取元数据
        
        Args:
            topic: Topic 字符串
            
        Returns:
            TopicInfo 对象，解析失败返回 None
            
        Examples:
            >>> tm.parse_topic("room/bedroom_01/agent/room-agent-1/control")
            TopicInfo(scope='room', room_id='bedroom_01', agent_id='room-agent-1', 
                      topic_type=TopicType.CONTROL)
            
            >>> tm.parse_topic("home/arbitration/response/req-123")
            TopicInfo(scope='home', room_id=None, agent_id=None, 
                      topic_type=TopicType.ARBITRATION_RESPONSE, correlation_id='req-123')
        """
        try:
            parts = topic.split('/')
            
            # Room Agent Topics: room/{room_id}/agent/{agent_id}/{type}
            if len(parts) == 5 and parts[0] == self.ROOM_PREFIX and parts[2] == self.AGENT_PREFIX:
                room_id = parts[1]
                agent_id = parts[3]
                topic_type_str = parts[4]
                
                # 映射到 TopicType
                topic_type_map = {
                    "control": TopicType.CONTROL,
                    "state": TopicType.STATE,
                    "describe": TopicType.DESCRIBE,
                    "description": TopicType.DESCRIPTION,
                    "heartbeat": TopicType.HEARTBEAT,
                }
                
                topic_type = topic_type_map.get(topic_type_str)
                if topic_type:
                    return TopicInfo(
                        scope=self.ROOM_PREFIX,
                        room_id=room_id,
                        agent_id=agent_id,
                        topic_type=topic_type
                    )
            
            # Home Topics: home/{type} 或 home/{type}/response/{correlation_id}
            elif parts[0] == self.HOME_PREFIX:
                if len(parts) == 2:
                    # home/state, home/policy, home/arbitration, home/events
                    topic_type_map = {
                        "state": TopicType.GLOBAL_STATE,
                        "policy": TopicType.POLICY,
                        "arbitration": TopicType.ARBITRATION,
                        "events": TopicType.EVENTS,
                    }
                    topic_type = topic_type_map.get(parts[1])
                    if topic_type:
                        return TopicInfo(
                            scope=self.HOME_PREFIX,
                            room_id=None,
                            agent_id=None,
                            topic_type=topic_type
                        )
                
                elif len(parts) == 4 and parts[1] == "arbitration" and parts[2] == "response":
                    # home/arbitration/response/{correlation_id}
                    return TopicInfo(
                        scope=self.HOME_PREFIX,
                        room_id=None,
                        agent_id=None,
                        topic_type=TopicType.ARBITRATION_RESPONSE,
                        correlation_id=parts[3]
                    )
            
            return None
            
        except Exception as e:
            print(f"[TopicManager] Error parsing topic '{topic}': {e}")
            return None
    
    def validate_topic(self, topic: str) -> bool:
        """验证 topic 格式是否合法
        
        Args:
            topic: Topic 字符串
            
        Returns:
            是否合法
        """
        return self.parse_topic(topic) is not None
    
    def is_room_topic(self, topic: str) -> bool:
        """判断是否为房间级别的 topic
        
        Args:
            topic: Topic 字符串
            
        Returns:
            是否为房间 topic
        """
        info = self.parse_topic(topic)
        return info is not None and info.scope == self.ROOM_PREFIX
    
    def is_home_topic(self, topic: str) -> bool:
        """判断是否为家庭级别的 topic
        
        Args:
            topic: Topic 字符串
            
        Returns:
            是否为家庭 topic
        """
        info = self.parse_topic(topic)
        return info is not None and info.scope == self.HOME_PREFIX
    
    def get_qos_for_topic(self, topic_type: TopicType) -> int:
        """根据 topic 类型获取推荐的 QoS 级别
        
        根据 docs/communication.md 的 QoS 策略：
        - control: QoS 1（命令不能丢失）
        - state: QoS 0（最新状态足够）
        - describe: QoS 1（必须收到响应）
        - description: QoS 1（响应不能丢失）
        - heartbeat: QoS 0（周期性，最新足够）
        - home/state: QoS 0
        - home/policy: QoS 1
        - home/arbitration: QoS 1
        - home/events: QoS 1
        
        Args:
            topic_type: Topic 类型
            
        Returns:
            QoS 级别 (0 或 1)
        """
        qos_map = {
            TopicType.CONTROL: 1,
            TopicType.STATE: 0,
            TopicType.DESCRIBE: 1,
            TopicType.DESCRIPTION: 1,
            TopicType.HEARTBEAT: 0,
            TopicType.GLOBAL_STATE: 0,
            TopicType.POLICY: 1,
            TopicType.ARBITRATION: 1,
            TopicType.ARBITRATION_RESPONSE: 1,
            TopicType.EVENTS: 1,
        }
        
        return qos_map.get(topic_type, 0)