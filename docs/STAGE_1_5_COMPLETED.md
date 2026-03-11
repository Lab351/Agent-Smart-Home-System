# A2A统一通信模型

## 概述

本次更新引入了符合A2A Protocol规范的统一通信模型，为后续支持多种通信方案（MQTT和A2A SDK）奠定基础。

## 新增内容

### 1. AgentCard标准 (`shared/models/agent_card.py`)

**AgentCard** 是Agent的唯一标识和能力描述，符合A2A Protocol规范。

#### 主要特性：
- **AgentType**: Agent类型枚举 (ROOM/PERSONAL/CENTRAL)
- **DeviceCapability**: 设备能力描述，支持A2A扩展字段
- **AgentSkill**: Agent技能，符合A2A标准
- **CommunicationConfig**: 通信配置

#### 示例：
```python
from shared.models import AgentCard, AgentType, AgentSkill, DeviceCapability

agent_card = AgentCard(
    id="room-agent-bedroom-01",
    name="卧室房间代理",
    description="管理卧室智能设备的Agent",
    version="1.0.0",
    agent_type=AgentType.ROOM,
    capabilities=["light_control", "curtain_control"],
    skills=[
        AgentSkill(
            id="adjust_lighting",
            name="调节照明",
            description="根据场景自动调节灯光",
            tags=["light", "automation"]
        )
    ],
    devices=[
        DeviceCapability(
            id="light_1",
            name="主灯",
            type="light",
            actions=["on", "off", "set_brightness"]
        )
    ]
)
```

### 2. A2A消息格式 (`shared/models/a2a_messages.py`)

统一的消息格式，所有消息都继承自 `A2AMessage` 基类。

#### 主要消息类型：
- **A2AMessage**: 消息基类，包含message_id、timestamp、correlation_id
- **A2ATask**: 任务对象（A2A SDK核心概念）
- **ControlMessage**: 设备控制消息
- **StateMessage**: 设备状态更新消息
- **DescriptionMessage**: 能力描述消息
- **HeartbeatMessage**: 心跳消息
- **GlobalStateMessage**: 全局状态消息
- **PolicyUpdateMessage**: 策略更新消息
- **ArbitrationRequestMessage**: 仲裁请求消息
- **ArbitrationResponseMessage**: 仲裁响应消息
- **SystemEventMessage**: 系统事件消息

#### 示例：
```python
from shared.models import ControlMessage, A2ATask

# 创建控制消息
control_msg = ControlMessage(
    source_agent="personal-agent-user1",
    target_device="light_1",
    action="set_brightness",
    parameters={"brightness": 80}
)

# 创建任务
task = A2ATask(
    status="pending",
    message=control_msg
)
```

### 3. Registry服务 (`qwen-backend/src/registry/`)

Agent服务注册中心，提供Agent发现和注册功能。

#### API端点：
- `POST /api/registry/register` - 注册Agent
- `GET /api/registry/discover` - 发现Agent
- `GET /api/registry/:agent_id` - 获取指定Agent
- `GET /api/registry/list` - 列出所有Agent
- `POST /api/registry/:agent_id/heartbeat` - 更新心跳
- `DELETE /api/registry/:agent_id` - 注销Agent
- `GET /api/registry/stats` - 获取统计信息
- `POST /api/registry/cleanup` - 清理超时Agent

#### 使用示例：
```bash
# 注册Agent
curl -X POST http://localhost:3000/api/registry/register \
  -H "Content-Type: application/json" \
  -d '{
    "id": "room-agent-bedroom-01",
    "name": "卧室房间代理",
    "description": "管理卧室智能设备",
    "agent_type": "room",
    "capabilities": ["light_control"]
  }'

# 发现Agent
curl http://localhost:3000/api/registry/discover?agent_type=room
```

## 向后兼容性

- ✅ 保留了所有旧的 `mqtt_messages` 模型
- ✅ 旧代码可以继续使用 `from shared.models.mqtt_messages import ...`
- ✅ 新模型与旧模型并存，渐进式迁移

## 配置文件

新增 `config/communication.yaml`，用于配置通信参数。

## 测试

运行测试验证实现：
```bash
PYTHONPATH=. python3 tests/test_a2a_models.py
```

## 下一步

接下来的实施阶段：
- **Stage 2**: 创建通信抽象层 (shared/communication/)
- **Stage 3**: 实现MQTT适配器
- **Stage 4**: 实现A2A SDK适配器
- **Stage 6**: Agent集成
- **Stage 7**: 部署和文档

## 参考资料

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A Python SDK](https://github.com/a2aproject/a2a-python)
- [Pydantic v2 Documentation](https://docs.pydantic.dev/latest/)
- [NestJS Documentation](https://docs.nestjs.com/)

---

**kunkun，Stage 1 和 Stage 5 已完成！** 🎉

所有模型都经过测试验证，Registry服务已集成到qwen-backend。下一步可以开始实施Stage 2（通信抽象层）。