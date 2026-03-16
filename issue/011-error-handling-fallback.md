# 错误处理与降级机制

## 优先级: P2 (Medium)

## 标签
`reliability` `error-handling`

## 概述
实现完善的错误处理机制，确保系统在异常情况下仍能稳定运行。

## 背景与动机
根据 [通信协议规范](../docs/communication.md#8-错误处理)，需要定义统一的错误处理机制和降级策略。

## 错误类型

| 错误码 | 描述 | 可重试 |
|--------|------|--------|
| `DEVICE_NOT_FOUND` | 设备不存在 | ❌ |
| `DEVICE_TIMEOUT` | 设备超时 | ✅ |
| `DEVICE_OFFLINE` | 设备离线 | ⏳ |
| `ACTION_NOT_SUPPORTED` | 不支持的操作 | ❌ |
| `INVALID_PARAMETERS` | 参数错误 | ❌ |
| `POLICY_VIOLATION` | 违反策略 | ❌ |
| `AUTHENTICATION_FAILED` | 认证失败 | ❌ |
| `BROKER_UNAVAILABLE` | Broker 不可用 | ✅ |
| `AGENT_TIMEOUT` | Agent 超时 | ✅ |

## 任务清单

### 错误消息格式
- [ ] 定义错误消息结构
  ```json
  {
    "message_id": "uuid",
    "timestamp": "2024-01-15T10:30:05Z",
    "error_code": "DEVICE_TIMEOUT",
    "error_message": "Device light_1 did not respond within 5s",
    "retry_suggested": true,
    "context": {
      "device_id": "light_1",
      "action": "on",
      "timeout": 5
    }
  }
  ```

### 重试机制
- [ ] 指数退避重试
- [ ] 最大重试次数
- [ ] 重试队列管理

### 降级策略
- [ ] Central Agent 离线时 Room Agent 本地运行
- [ ] Broker 离线时本地队列缓存
- [ ] 设备离线时标记状态并通知用户

### 超时配置
```yaml
timeouts:
  mqtt_connect: 5s
  mqtt_publish: 3s
  device_response: 5s
  arbitration: 10s
  heartbeat_interval: 30s
  heartbeat_timeout: 90s
```

## 接口设计

```python
class ErrorHandler:
    async def handle_error(self, error: AgentError) -> ErrorResponse:
        """处理错误并返回响应"""
    
    async def should_retry(self, error: AgentError) -> bool:
        """判断是否应该重试"""
    
    async def get_retry_delay(self, attempt: int) -> float:
        """获取重试延迟（指数退避）"""
    
    async def apply_fallback(self, error: AgentError) -> Optional[Action]:
        """应用降级策略"""

class RetryManager:
    async def enqueue(self, message: Message, max_retries: int = 3) -> None:
        """加入重试队列"""
    
    async def process_queue(self) -> None:
        """处理重试队列"""
```

## 降级场景

### 场景 1: Central Agent 离线
```python
# Room Agent 行为
if not central_agent_connected:
    # 使用本地缓存的策略
    policy = local_policy_cache.get_current()
    # 本地决策
    decision = local_decision(intent, policy)
```

### 场景 2: Broker 离线
```python
# Agent 行为
if not mqtt_connected:
    # 缓存消息到本地队列
    message_queue.append(message)
    # 尝试重连
    await reconnect_with_backoff()
    # 重连成功后发送缓存消息
    await send_cached_messages()
```

### 场景 3: 设备离线
```python
# Room Agent 行为
if device.offline:
    # 标记设备状态
    update_device_state(device_id, "offline")
    # 通知用户
    await notify_user(f"设备 {device.name} 当前离线")
    # 记录日志
    log_device_event(device_id, "offline")
```

## 文件位置
- `shared/errors/` - 错误定义
- `shared/retry/` - 重试机制
- `shared/fallback/` - 降级策略

## 验收标准
- [ ] 所有错误类型已定义
- [ ] 重试机制正常工作
- [ ] 降级策略正确执行
- [ ] 错误消息格式正确

## 相关文档
- [通信协议规范 - 错误处理](../docs/communication.md#8-错误处理)