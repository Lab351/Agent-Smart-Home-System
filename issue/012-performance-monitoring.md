# 性能优化与监控

## 优先级: P2 (Medium)

## 标签
`performance` `monitoring` `optimization`

## 概述
优化系统性能并实现监控指标收集，确保系统满足性能要求。

## 性能指标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| Beacon API 发现延迟 | < 200ms | HTTP 请求到响应 |
| MQTT 连接延迟 | < 200ms | CONNECT 到 CONNACK |
| 控制端到端延迟 | < 500ms | 意图到状态更新 |
| 消息吞吐量 | 100 msg/s | 每房间 |
| 心跳周期 | 30s | 定时发送 |

## 任务清单

### 性能优化
- [ ] MQTT 连接池
- [ ] 消息批量处理
- [ ] 状态缓存
- [ ] 异步 I/O 优化

### 监控指标
- [ ] 连接状态监控
- [ ] 消息延迟监控
- [ ] 吞吐量监控
- [ ] 错误率监控

### 心跳机制
- [ ] Agent 心跳实现
  ```json
  {
    "agent_id": "room-agent-1",
    "status": "operational",
    "uptime_seconds": 3600,
    "metrics": {
      "cpu_usage": 25.5,
      "memory_usage": 45.2,
      "active_connections": 3
    }
  }
  ```

### 健康检查
- [ ] Agent 健康检查端点
- [ ] Broker 健康检查
- [ ] 系统整体健康状态

## 接口设计

```python
class MetricsCollector:
    def record_latency(self, operation: str, latency_ms: float) -> None:
        """记录操作延迟"""
    
    def record_throughput(self, topic: str, count: int) -> None:
        """记录吞吐量"""
    
    def record_error(self, error_type: str) -> None:
        """记录错误"""
    
    def get_metrics(self) -> dict:
        """获取所有指标"""

class HealthChecker:
    async def check_agent_health(self, agent_id: str) -> HealthStatus:
        """检查 Agent 健康状态"""
    
    async def check_broker_health(self) -> HealthStatus:
        """检查 Broker 健康状态"""
    
    async def get_system_health(self) -> SystemHealth:
        """获取系统整体健康状态"""
```

## Prometheus 指标示例

```python
from prometheus_client import Counter, Histogram, Gauge

# 延迟直方图
message_latency = Histogram(
    'a2a_message_latency_seconds',
    'Message latency in seconds',
    ['operation', 'source', 'target']
)

# 消息计数
message_count = Counter(
    'a2a_message_total',
    'Total messages sent',
    ['topic', 'qos']
)

# 连接状态
connection_status = Gauge(
    'a2a_connection_status',
    'Connection status (1=connected, 0=disconnected)',
    ['agent_id', 'broker']
)

# 活跃连接数
active_connections = Gauge(
    'a2a_active_connections',
    'Number of active connections',
    ['agent_id']
)
```

## Grafana Dashboard

建议创建以下面板：
1. **概览面板** - 系统整体状态
2. **延迟面板** - 各操作延迟趋势
3. **吞吐量面板** - 消息吞吐趋势
4. **错误面板** - 错误率趋势
5. **连接面板** - 连接状态和数量

## 配置示例

```yaml
monitoring:
  enabled: true
  metrics_port: 9090
  
  heartbeat:
    interval: 30s
    timeout: 90s
  
  health_check:
    endpoint: "/health"
    interval: 10s
  
  prometheus:
    enabled: true
    path: "/metrics"
  
  logging:
    level: "INFO"
    format: "json"
```

## 文件位置
- `shared/metrics/` - 指标收集
- `shared/health/` - 健康检查

## 验收标准
- [ ] 所有性能指标达标
- [ ] Prometheus 指标正确暴露
- [ ] 健康检查正常工作
- [ ] Grafana 仪表板可用

## 相关文档
- [通信协议规范 - 性能指标](../docs/communication.md#9-性能指标)