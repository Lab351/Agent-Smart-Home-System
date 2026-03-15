# 消息格式标准化

## 优先级: P0 (Critical)

## 标签
`infrastructure` `messaging` `a2a-communication`

## 概述
定义和实现 Agent 间通信的标准化消息格式，确保所有 Agent 使用统一的消息结构。

## 背景与动机
根据 [通信协议规范](../docs/communication.md#5-消息格式规范)，所有消息必须包含统一的消息头，并支持多种消息类型。

## 任务清单

### 消息头定义
- [ ] 通用消息头
  ```json
  {
    "message_id": "uuid-v4",
    "timestamp": "2024-01-15T10:30:00Z",
    "source_agent": "agent-id",
    "version": "1.0.0"
  }
  ```

### 消息类型实现
- [ ] 控制消息 (ControlMessage)
  - 目标设备
  - 动作类型
  - 参数
  - 关联 ID

- [ ] 状态消息 (StateMessage)
  - 房间状态
  - Agent 状态
  - 设备状态

- [ ] 心跳消息 (HeartbeatMessage)
  - Agent ID
  - 运行状态
  - 性能指标

- [ ] 描述消息 (DescribeMessage)
  - 能力查询
  - 能力响应

- [ ] 全局状态消息 (GlobalStateMessage)
  - 家庭模式
  - 活跃用户
  - 风险等级

- [ ] 仲裁消息 (ArbitrationMessage)
  - 仲裁请求
  - 仲裁响应
  - 决策类型

- [ ] 策略消息 (PolicyMessage)
  - 策略名称
  - 规则内容
  - 生效时间

- [ ] 事件消息 (EventMessage)
  - 事件类型
  - 事件数据

### Pydantic 模型
```python
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional, Dict, Any, List

class MessageHeader(BaseModel):
    message_id: UUID
    timestamp: datetime
    source_agent: str
    version: str = "1.0.0"

class ControlMessage(BaseModel):
    header: MessageHeader
    target_device: str
    action: str
    parameters: Optional[Dict[str, Any]] = None
    correlation_id: Optional[UUID] = None
```

## 文件位置
- `shared/models/mqtt_messages.py`

## 依赖
- `pydantic` >= 2.0
- `python-ulid` 或 `uuid`

## 验收标准
- [ ] 所有消息类型都有对应的 Pydantic 模型
- [ ] 支持 JSON 序列化/反序列化
- [ ] 包含完整的类型验证
- [ ] 支持向后兼容（version 字段）

## 相关文档
- [通信协议规范 - 消息格式](../docs/communication.md#5-消息格式规范)