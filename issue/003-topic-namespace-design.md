# Topic 命名空间设计

## 优先级: P0 (Critical)

## 标签
`infrastructure` `mqtt` `a2a-communication`

## 概述
设计和实现 MQTT Topic 命名空间，为 Agent 间通信提供规范化的主题结构。

## 背景与动机
根据 [通信协议规范](../docs/communication.md#42-topic-命名空间)，需要定义清晰的 Topic 层次结构来组织 Agent 间的消息路由。

## Topic 层次结构

### 房间级 Topic
```
room/{room_id}/
├── agent/{agent_id}/
│   ├── control/          # 控制命令 (QoS 1)
│   ├── state/            # 状态发布 (QoS 0)
│   ├── describe/         # 能力查询 (QoS 1)
│   ├── description/      # 能力响应 (QoS 1)
│   └── heartbeat/        # 心跳 (QoS 0)
├── robot/{robot_id}/
│   ├── control/
│   ├── state/
│   └── telemetry/
└── system/
    ├── discovery/
    └── error/
```

### 全局级 Topic
```
home/
├── state/                # 全局状态 (QoS 0)
├── policy/               # 策略更新 (QoS 1)
├── arbitration/          # 仲裁请求/响应 (QoS 1)
├── events/               # 系统事件 (QoS 1)
└── heartbeat/            # Central Agent 心跳 (QoS 0)
```

## 任务清单

### Topic 生成器
- [ ] 实现 TopicBuilder 类
  ```python
  class TopicBuilder:
      @staticmethod
      def control(room_id: str, agent_id: str) -> str
      
      @staticmethod
      def state(room_id: str, agent_id: str) -> str
      
      @staticmethod
      def describe(room_id: str, agent_id: str) -> str
      
      @staticmethod
      def description(room_id: str, agent_id: str) -> str
      
      @staticmethod
      def heartbeat(room_id: str, agent_id: str) -> str
      
      @staticmethod
      def global_state() -> str
      
      @staticmethod
      def policy() -> str
      
      @staticmethod
      def arbitration(request_id: str = None) -> str
  ```

### Topic 订阅模式
- [ ] 定义订阅模式（支持通配符）
  ```python
  # Personal Agent 订阅
  SUBSCRIBE_ROOM_STATE = "room/{room_id}/agent/+/state"
  SUBSCRIBE_ROOM_DESCRIPTION = "room/{room_id}/agent/+/description"
  SUBSCRIBE_HOME_STATE = "home/state"
  SUBSCRIBE_HOME_POLICY = "home/policy"
  
  # Room Agent 订阅
  SUBSCRIBE_CONTROL = "room/{room_id}/agent/{agent_id}/control"
  SUBSCRIBE_DESCRIBE = "room/{room_id}/agent/{agent_id}/describe"
  SUBSCRIBE_HOME_POLICY = "home/policy"
  ```

### QoS 配置
- [ ] 实现 QoS 配置映射
  ```python
  TOPIC_QOS_MAP = {
      "control": 1,
      "state": 0,
      "describe": 1,
      "description": 1,
      "heartbeat": 0,
      "home/state": 0,
      "home/policy": 1,
      "home/arbitration": 1,
      "home/events": 1,
  }
  ```

## 文件位置
- `shared/mqtt/topics.py`

## 验收标准
- [ ] Topic 生成正确性测试
- [ ] 通配符订阅测试
- [ ] QoS 映射正确

## 相关文档
- [通信协议规范 - Topic 命名空间](../docs/communication.md#42-topic-命名空间)