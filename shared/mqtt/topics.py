# shared/mqtt/topics.py
"""A2A Topic 命名空间工具类

根据 docs/communication.md 规范定义 Topic 命名空间
"""

from typing import Optional


class TopicBuilder:
    """Topic 构建器
    
    用于生成标准化的 MQTT Topic
    """
    
    @staticmethod
    def control(room_id: str, agent_id: str) -> str:
        """控制命令 Topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic: room/{room_id}/agent/{agent_id}/control
        """
        return f"room/{room_id}/agent/{agent_id}/control"
    
    @staticmethod
    def state(room_id: str, agent_id: str) -> str:
        """状态发布 Topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic: room/{room_id}/agent/{agent_id}/state
        """
        return f"room/{room_id}/agent/{agent_id}/state"
    
    @staticmethod
    def describe(room_id: str, agent_id: str) -> str:
        """能力查询 Topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic: room/{room_id}/agent/{agent_id}/describe
        """
        return f"room/{room_id}/agent/{agent_id}/describe"
    
    @staticmethod
    def description(room_id: str, agent_id: str) -> str:
        """能力响应 Topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic: room/{room_id}/agent/{agent_id}/description
        """
        return f"room/{room_id}/agent/{agent_id}/description"
    
    @staticmethod
    def heartbeat(room_id: str, agent_id: str) -> str:
        """心跳 Topic
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic: room/{room_id}/agent/{agent_id}/heartbeat
        """
        return f"room/{room_id}/agent/{agent_id}/heartbeat"
    
    @staticmethod
    def global_state() -> str:
        """全局状态 Topic
        
        Returns:
            Topic: home/state
        """
        return "home/state"
    
    @staticmethod
    def policy() -> str:
        """策略更新 Topic
        
        Returns:
            Topic: home/policy
        """
        return "home/policy"
    
    @staticmethod
    def arbitration(request_id: Optional[str] = None) -> str:
        """仲裁 Topic
        
        Args:
            request_id: 请求 ID（可选，用于响应）
            
        Returns:
            Topic: home/arbitration 或 home/arbitration/response/{request_id}
        """
        if request_id:
            return f"home/arbitration/response/{request_id}"
        return "home/arbitration"
    
    @staticmethod
    def events() -> str:
        """系统事件 Topic
        
        Returns:
            Topic: home/events
        """
        return "home/events"
    
    @staticmethod
    def system_discovery(room_id: str) -> str:
        """系统发现 Topic
        
        Args:
            room_id: 房间 ID
            
        Returns:
            Topic: room/{room_id}/system/discovery
        """
        return f"room/{room_id}/system/discovery"
    
    @staticmethod
    def system_error(room_id: str) -> str:
        """系统错误 Topic
        
        Args:
            room_id: 房间 ID
            
        Returns:
            Topic: room/{room_id}/system/error
        """
        return f"room/{room_id}/system/error"


class TopicParser:
    """Topic 解析器
    
    用于解析 MQTT Topic 提取信息
    """
    
    @staticmethod
    def parse(topic: str) -> dict:
        """解析 Topic
        
        Args:
            topic: MQTT Topic
            
        Returns:
            解析结果字典，包含:
            - type: 'room' 或 'home'
            - room_id: 房间 ID（如果 type == 'room'）
            - agent_id: Agent ID（如果有）
            - message_type: 消息类型 (control/state/describe/description/heartbeat)
        """
        parts = topic.split('/')
        result = {}
        
        if parts[0] == 'room' and len(parts) >= 2:
            result['type'] = 'room'
            result['room_id'] = parts[1]
            
            if len(parts) >= 4 and parts[2] == 'agent':
                result['agent_id'] = parts[3]
                
            if len(parts) >= 5:
                result['message_type'] = parts[4]
            elif len(parts) >= 4 and parts[2] == 'system':
                result['message_type'] = parts[3]
                
        elif parts[0] == 'home':
            result['type'] = 'home'
            
            if len(parts) >= 2:
                result['message_type'] = parts[1]
                
            if len(parts) >= 3 and parts[1] == 'arbitration' and parts[2] == 'response':
                result['is_response'] = True
                if len(parts) >= 4:
                    result['request_id'] = parts[3]
        
        return result


class QoSConfig:
    """QoS 配置
    
    定义各类消息的 QoS 等级
    """
    
    QOS_MAP = {
        'control': 1,
        'state': 0,
        'describe': 1,
        'description': 1,
        'heartbeat': 0,
        'home/state': 0,
        'home/policy': 1,
        'home/arbitration': 1,
        'home/events': 1,
    }
    
    @classmethod
    def get_qos(cls, message_type: str) -> int:
        """获取消息类型的 QoS 等级
        
        Args:
            message_type: 消息类型
            
        Returns:
            QoS 等级 (0, 1, 2)
        """
        return cls.QOS_MAP.get(message_type, 0)
    
    @classmethod
    def get_qos_for_topic(cls, topic: str) -> int:
        """根据 Topic 获取 QoS 等级
        
        Args:
            topic: MQTT Topic
            
        Returns:
            QoS 等级 (0, 1, 2)
        """
        parsed = TopicParser.parse(topic)
        
        if parsed.get('type') == 'home':
            message_type = f"home/{parsed.get('message_type', '')}"
            return cls.QOS_MAP.get(message_type, 0)
        
        message_type = parsed.get('message_type', '')
        return cls.QOS_MAP.get(message_type, 0)


class SubscriptionTopics:
    """订阅 Topic 模式
    
    定义各 Agent 需要订阅的 Topic 模式
    """
    
    @staticmethod
    def personal_agent(room_id: str) -> list:
        """Personal Agent 订阅的 Topics
        
        Args:
            room_id: 房间 ID
            
        Returns:
            Topic 列表
        """
        return [
            f"room/{room_id}/agent/+/state",
            f"room/{room_id}/agent/+/description",
            "home/state",
            "home/policy",
            "home/arbitration/response/+",
        ]
    
    @staticmethod
    def room_agent(room_id: str, agent_id: str) -> list:
        """Room Agent 订阅的 Topics
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            
        Returns:
            Topic 列表
        """
        return [
            f"room/{room_id}/agent/{agent_id}/control",
            f"room/{room_id}/agent/{agent_id}/describe",
            "home/policy",
        ]
    
    @staticmethod
    def central_agent() -> list:
        """Central Agent 订阅的 Topics
        
        Returns:
            Topic 列表
        """
        return [
            "room/+/agent/+/state",
            "room/+/agent/+/heartbeat",
            "home/arbitration",
        ]