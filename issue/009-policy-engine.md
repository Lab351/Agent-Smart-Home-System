# 策略引擎实现

## 优先级: P1 (High)

## 标签
`core-feature` `central-agent` `policy`

## 概述
实现 Central Agent 的策略引擎，支持声明式规则定义和自动执行。

## 背景与动机
根据 [Central Agent 规格](../docs/agents/central-agent.md#42-全局策略与规则管理)，Central Agent 通过声明式策略来引导系统行为。

## 策略示例

```yaml
policies:
  sleep_mode:
    light_max: low
    noise_max: minimum
    interruptible: false
    priority: 80
    schedule: "22:00-07:00"

  away_mode:
    all_devices: off
    security: armed
    priority: 90
    auto_trigger: "no_users_home_for_10min"

  child_protection:
    content_filter: enabled
    volume_max: 50
    priority: 70
    users: ["child"]
```

## 任务清单

### 策略定义
- [ ] 策略 YAML 解析
- [ ] 策略验证
- [ ] 策略冲突检测

### 策略执行
- [ ] 模式匹配
- [ ] 条件评估
- [ ] 动作触发

### 策略管理
- [ ] 策略热加载
- [ ] 策略版本控制
- [ ] 策略审计日志

### 内置策略
- [ ] `sleep_mode` - 睡眠模式
- [ ] `away_mode` - 离家模式
- [ ] `child_protection` - 儿童保护
- [ ] `energy_saving` - 节能模式

## 接口设计

```python
class PolicyEngine:
    def __init__(self, policy_file: str):
        self.policies: Dict[str, Policy] = {}
        self.load_policies(policy_file)
    
    def load_policies(self, file_path: str) -> None:
        """加载策略文件"""
    
    def reload_policies(self) -> None:
        """热加载策略"""
    
    async def evaluate(self, context: dict) -> List[Policy]:
        """评估当前适用的策略"""
    
    async def check_violation(self, intent: Intent, context: dict) -> Optional[Violation]:
        """检查意图是否违反策略"""
    
    async def apply_modification(self, intent: Intent, policy: Policy) -> Intent:
        """应用策略修改（降级）"""
    
    def get_active_policies(self) -> List[Policy]:
        """获取当前活跃的策略"""
```

## 策略评估流程

```python
async def evaluate_policies(context: dict) -> List[Policy]:
    """
    1. 检查时间触发（如 sleep_mode 的 schedule）
    2. 检查自动触发（如 away_mode 的 auto_trigger）
    3. 检查当前模式
    4. 按优先级排序返回
    """
    active = []
    
    for name, policy in self.policies.items():
        if policy.matches_context(context):
            active.append(policy)
    
    return sorted(active, key=lambda p: p.priority, reverse=True)
```

## 策略规则类型

| 规则类型 | 描述 | 示例 |
|---------|------|------|
| `light_max` | 光照限制 | low, medium, high |
| `noise_max` | 噪音限制 | minimum, low, medium |
| `volume_max` | 音量限制 | 0-100 |
| `all_devices` | 所有设备状态 | on, off |
| `security` | 安防状态 | armed, disarmed |
| `interruptible` | 是否可中断 | true, false |

## 文件位置
- `home-agent/core/central_agent/policy_engine/`
- `home-agent/config/policies.yaml` - 策略配置文件

## 验收标准
- [ ] YAML 解析正确
- [ ] 策略评估正确
- [ ] 策略修改正确应用
- [ ] 热加载正常工作

## 相关文档
- [Central Agent 规格 - 策略管理](../docs/agents/central-agent.md#42-全局策略与规则管理)