# MQTT 客户端管理器

## 优先级: P0 (Critical)

## 标签
`infrastructure` `mqtt` `a2a-communication`

## 概述
实现统一的 MQTT 客户端管理器，为所有 Agent 提供可靠的 MQTT 连接管理能力。

## 背景与动机
根据 [通信协议规范](../docs/communication.md)，MQTT 是 Agent 间通信的核心协议。需要一个统一的客户端管理器来处理连接、断开、重连等场景。

## 任务清单

### 核心功能
- [ ] 连接管理
  - 支持 TCP 和 WebSocket 连接
  - 自动重连机制
  - Keep-Alive 心跳维护

- [ ] 订阅管理
  - 支持通配符订阅
  - 自动重订阅（重连后）
  - 订阅状态追踪

- [ ] 发布管理
  - QoS 级别支持 (0, 1, 2)
  - 消息队列（离线时缓存）
  - 发布确认回调

- [ ] 异常处理
  - 连接超时处理
  - 网络断开恢复
  - Broker 不可用降级

### 配置支持
```yaml
mqtt:
  broker:
    host: "192.168.1.100"
    port: 1883
    ws_port: 9001
  client:
    client_id: "agent-{type}-{id}"
    keep_alive: 60
    clean_session: true
  reconnect:
    enabled: true
    delay: 5
    max_delay: 60
    max_retries: 10
  qos:
    default: 1
```

## 技术规格

| 功能 | 要求 |
|------|------|
| 连接延迟 | < 200ms |
| 重连成功率 | > 99% |
| 消息可靠性 | QoS 1/2 不丢失 |

## 接口设计

```python
class MQTTClientManager:
    async def connect(self, broker: str, port: int) -> bool
    async def disconnect(self) -> None
    async def subscribe(self, topic: str, qos: int = 1) -> bool
    async def unsubscribe(self, topic: str) -> bool
    async def publish(self, topic: str, payload: dict, qos: int = 1) -> bool
    def on_message(self, callback: Callable) -> None
    def is_connected(self) -> bool
```

## 文件位置
- `shared/mqtt/client_manager.py`

## 依赖
- `paho-mqtt` 或 `aiomqtt` (异步版本)

## 验收标准
- [ ] 单元测试覆盖率 > 80%
- [ ] 支持并发连接
- [ ] 重连机制正常工作
- [ ] 所有 QoS 级别正确实现

## 相关文档
- [通信协议规范](../docs/communication.md)
- [Room Agent 规格](../docs/agents/room-agent.md)