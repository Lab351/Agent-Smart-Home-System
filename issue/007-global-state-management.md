# 全局状态管理

## 优先级: P1 (High)

## 标签
`core-feature` `central-agent` `state-management`

## 概述
实现 Central Agent 的全局状态管理，维护跨空间、跨用户的全局状态。

## 背景与动机
根据 [Central Agent 规格](../docs/agents/central-agent.md#41-全局状态建模)，Central Agent 负责维护系统级抽象状态。

## 全局状态模型

```json
{
  "home_id": "home-001",
  "mode": "home",
  "occupancy": {
    "anyone_home": true,
    "active_users": ["user1", "user2"],
    "last_change": "2024-01-15T22:30:00Z"
  },
  "temporal_context": {
    "day_type": "workday",
    "time_period": "night",
    "timezone": "Asia/Shanghai"
  },
  "risk_level": "normal",
  "timestamp": "2024-01-15T22:30:00Z"
}
```

## 任务清单

### 状态维度

- [ ] **家庭模式**
  - `home` - 在家模式
  - `away` - 离家模式
  - `sleep` - 睡眠模式
  - `vacation` - 假期模式

- [ ] **居住状态**
  - 是否有人在家
  - 当前活跃用户
  - 最后变化时间

- [ ] **时间上下文**
  - 工作日/周末
  - 时段（早晨/白天/傍晚/夜间）
  - 时区

- [ ] **风险等级**
  - `normal` - 正常
  - `warning` - 警告
  - `critical` - 紧急

### 功能实现
- [ ] 状态更新接口
- [ ] 状态变化检测
- [ ] 状态发布（MQTT）
- [ ] 状态持久化

### 自动触发规则
- [ ] 离家模式自动触发（无人 10 分钟）
- [ ] 睡眠模式定时触发（22:00-07:00）
- [ ] 风险等级自动调整

## 接口设计

```python
class GlobalStateManager:
    async def set_home_mode(self, mode: HomeMode) -> None:
        """设置家庭模式"""
    
    async def update_occupancy(self, user_id: str, is_home: bool) -> None:
        """更新用户居住状态"""
    
    async def set_risk_level(self, level: RiskLevel) -> None:
        """设置风险等级"""
    
    async def get_state(self) -> GlobalState:
        """获取当前全局状态"""
    
    async def subscribe_changes(self, callback: Callable) -> None:
        """订阅状态变化"""
```

## 模式切换逻辑

```python
# 自动离家模式
async def check_auto_away():
    if not state.active_users and state.last_user_left > 10min:
        await set_home_mode(HomeMode.AWAY)
        await broadcast_event("mode_switch", {"to": "away"})

# 定时睡眠模式
async def schedule_sleep_mode():
    if current_time in SLEEP_HOURS and state.mode == "home":
        await set_home_mode(HomeMode.SLEEP)
        await broadcast_event("mode_switch", {"to": "sleep"})
```

## 文件位置
- `home-agent/core/central_agent/state_manager/`

## 验收标准
- [ ] 模式切换正确
- [ ] 居住状态实时更新
- [ ] 自动触发规则正常工作
- [ ] 状态变化正确广播

## 相关文档
- [Central Agent 规格](../docs/agents/central-agent.md)