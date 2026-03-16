# 仲裁机制实现

## 优先级: P1 (High)

## 标签
`core-feature` `central-agent` `arbitration`

## 概述
实现 Central Agent 的冲突仲裁机制，处理多用户冲突和策略违规场景。

## 背景与动机
根据 [Central Agent 规格](../docs/agents/central-agent.md#44-决策仲裁)，Central Agent 需要在多用户冲突或策略违规时进行仲裁。

## 仲裁场景

### 多用户冲突
```
User A: "打开卧室灯"
User B: (正在卧室睡觉)
→ 冲突检测 → 仲裁 → partial_accept (降级执行)
```

### 策略违规
```
User: "播放音乐" (volume: 80)
Current Mode: sleep
Policy: noise_max = minimum
→ 仲裁 → partial_accept (volume: 20)
```

## 任务清单

### 仲裁触发条件
- [ ] 多用户意图冲突检测
- [ ] 意图违反全局规则检测
- [ ] 资源竞争检测

### 仲裁决策类型
- [ ] `accept` - 完全接受
- [ ] `reject` - 完全拒绝
- [ ] `partial_accept` - 降级执行
- [ ] `defer` - 延迟执行

### 仲裁策略
- [ ] 用户优先级排序
- [ ] 规则裁剪（降级）
- [ ] 时间窗口控制

### 仲裁消息格式

#### 请求
```json
// Topic: home/arbitration
{
  "message_id": "uuid",
  "requesting_agent": "personal-agent-user1",
  "conflicting_agents": ["personal-agent-user2"],
  "conflict_type": "multi_user_intent",
  "intent": {
    "target_device": "light_1",
    "action": "on"
  },
  "context": {
    "room_id": "bedroom",
    "current_mode": "sleep"
  }
}
```

#### 响应
```json
// Topic: home/arbitration/response/{request_id}
{
  "request_id": "original-request-id",
  "decision": "partial_accept",
  "reason": "sleep_mode_active",
  "suggestion": "reduced_brightness",
  "modified_action": {
    "target_device": "light_1",
    "action": "on",
    "parameters": {"brightness": 20}
  }
}
```

## 接口设计

```python
class ArbitrationEngine:
    async def request_arbitration(self, request: ArbitrationRequest) -> ArbitrationResponse:
        """请求仲裁"""
    
    async def check_policy_violation(self, intent: Intent, current_mode: str) -> Optional[str]:
        """检查策略违规"""
    
    async def check_user_conflict(self, room_id: str, user_id: str) -> List[str]:
        """检查用户冲突"""
    
    async def apply_modification(self, intent: Intent, policy: Policy) -> Intent:
        """应用降级修改"""
```

## 用户优先级配置

```yaml
users:
  - user_id: "admin"
    role: "admin"
    priority: 100
  - user_id: "adult"
    role: "adult"
    priority: 80
  - user_id: "child"
    role: "child"
    priority: 50
```

## 仲裁流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Intent     │────►│  Conflict    │────►│  Arbitration │
│   Received   │     │  Detection   │     │  Decision    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ▼                            ▼                            ▼
             ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
             │   Accept     │            │   Reject     │            │   Modify     │
             │   (执行)      │            │   (拒绝)      │            │   (降级)      │
             └──────────────┘            └──────────────┘            └──────────────┘
```

## 文件位置
- `home-agent/core/central_agent/arbitrator/`

## 验收标准
- [ ] 冲突检测正确
- [ ] 策略违规检测正确
- [ ] 仲裁决策符合预期
- [ ] 降级修改合理

## 测试场景
1. 睡眠模式下请求高音量播放音乐
2. 用户 A 在房间时用户 B 请求开灯
3. 儿童用户请求受限操作

## 相关文档
- [Central Agent 规格 - 仲裁](../docs/agents/central-agent.md#44-决策仲裁)
- [通信协议规范 - 仲裁消息](../docs/communication.md#59-仲裁请求消息)