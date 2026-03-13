"""策略引擎

管理智能家居系统的策略规则：
- 策略定义和加载
- 策略匹配和检查
- 策略冲突检测
- 策略裁剪（降级）
"""

import asyncio
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

from shared.models.mqtt_messages import PolicyUpdateMessage


@dataclass
class PolicyRule:
    """策略规则"""
    name: str
    priority: int  # 优先级（0-100），数值越大优先级越高
    conditions: Dict[str, Any]  # 触发条件
    constraints: Dict[str, Any]  # 约束规则
    description: str = ""


class PolicyEngine:
    """策略引擎

    职责：
    - 加载和管理策略规则
    - 检查意图是否违反策略
    - 提供策略裁剪建议（降级）
    - 发布策略更新
    """

    def __init__(self, policy_file: Optional[str] = None):
        """初始化策略引擎

        Args:
            policy_file: 策略配置文件路径（YAML格式）
        """
        # 策略规则库（按名称索引）
        self.policies: Dict[str, PolicyRule] = {}

        # 策略配置文件
        self.policy_file = policy_file

        # 策略更新监听器
        self._policy_listeners: List[callable] = []

        # 加载默认策略
        self._load_default_policies()

        # 从配置文件加载策略（如果提供）
        if policy_file:
            self.load_policies_from_file(policy_file)

        print(f"[PolicyEngine] Initialized with {len(self.policies)} policies")

    def _load_default_policies(self):
        """加载默认策略"""
        # Sleep模式策略
        self.add_policy(PolicyRule(
            name="sleep_mode",
            priority=80,
            conditions={"home_mode": "sleep"},
            constraints={
                "light_max": "low",  # 灯光最大亮度限制
                "noise_max": "minimum",  # 噪音限制
                "interruptible": False,  # 是否可中断
            },
            description="Sleep mode - low light, minimum noise"
        ))

        # Away模式策略
        self.add_policy(PolicyRule(
            name="away_mode",
            priority=90,
            conditions={"home_mode": "away"},
            constraints={
                "all_devices": "off",
                "security": "armed",
            },
            description="Away mode - all devices off, security armed"
        ))

        # 儿童保护策略
        self.add_policy(PolicyRule(
            name="child_protection",
            priority=70,
            conditions={"user_role": "child"},
            constraints={
                "volume_max": 50,  # 音量限制
                "content_filter": "enabled",  # 内容过滤
            },
            description="Child protection - volume limit, content filter"
        ))

        # 节能模式策略
        self.add_policy(PolicyRule(
            name="energy_saving",
            priority=60,
            conditions={"home_mode": "away"},
            constraints={
                "climate": "eco",  # 空调节能模式
                "lights": "auto_off",  # 自动关灯
            },
            description="Energy saving mode"
        ))

    def add_policy(self, policy: PolicyRule):
        """添加策略

        Args:
            policy: 策略规则
        """
        self.policies[policy.name] = policy
        print(f"[PolicyEngine] Added policy: {policy.name} (priority={policy.priority})")

    def remove_policy(self, policy_name: str):
        """移除策略

        Args:
            policy_name: 策略名称
        """
        if policy_name in self.policies:
            del self.policies[policy_name]
            print(f"[PolicyEngine] Removed policy: {policy_name}")

    def get_policy(self, policy_name: str) -> Optional[PolicyRule]:
        """获取策略

        Args:
            policy_name: 策略名称

        Returns:
            策略规则，如果不存在返回None
        """
        return self.policies.get(policy_name)

    def get_all_policies(self) -> Dict[str, PolicyRule]:
        """获取所有策略

        Returns:
            所有策略规则
        """
        return self.policies.copy()

    def load_policies_from_file(self, policy_file: str):
        """从YAML文件加载策略

        Args:
            policy_file: 策略配置文件路径
        """
        try:
            path = Path(policy_file)
            if not path.exists():
                print(f"[PolicyEngine] Policy file not found: {policy_file}")
                return

            with open(path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)

            # 解析策略配置
            if "policies" in data:
                for name, config in data["policies"].items():
                    policy = PolicyRule(
                        name=name,
                        priority=config.get("priority", 50),
                        conditions=config.get("conditions", {}),
                        constraints=config.get("constraints", {}),
                        description=config.get("description", "")
                    )
                    self.add_policy(policy)

            print(f"[PolicyEngine] Loaded policies from {policy_file}")

        except Exception as e:
            print(f"[PolicyEngine] Failed to load policies: {e}")

    def check_intent(self, intent: Dict[str, Any], context: Dict[str, Any]) -> Tuple[bool, Optional[PolicyRule]]:
        """检查意图是否违反策略

        Args:
            intent: 用户意图 {"action": "music_play", "parameters": {"volume": 80}}
            context: 上下文信息 {"home_mode": "sleep", "user_role": "adult"}

        Returns:
            (是否违反, 违反的策略)
        """
        # 获取当前激活的策略（基于上下文匹配条件）
        active_policies = self._get_active_policies(context)

        # 检查每个激活的策略
        for policy in active_policies:
            violation = self._check_policy_violation(intent, policy)
            if violation:
                return True, policy

        return False, None

    def _get_active_policies(self, context: Dict[str, Any]) -> List[PolicyRule]:
        """获取当前激活的策略

        Args:
            context: 上下文信息

        Returns:
            激活的策略列表（按优先级降序）
        """
        active = []

        for policy in self.policies.values():
            # 检查策略条件是否匹配
            if self._match_conditions(policy.conditions, context):
                active.append(policy)

        # 按优先级降序排序
        active.sort(key=lambda p: p.priority, reverse=True)

        return active

    def _match_conditions(self, conditions: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """匹配策略条件

        Args:
            conditions: 策略条件
            context: 上下文

        Returns:
            是否匹配
        """
        for key, value in conditions.items():
            if context.get(key) != value:
                return False
        return True

    def _check_policy_violation(self, intent: Dict[str, Any], policy: PolicyRule) -> bool:
        """检查意图是否违反特定策略

        Args:
            intent: 用户意图
            policy: 策略规则

        Returns:
            是否违反
        """
        action = intent.get("action")
        parameters = intent.get("parameters", {})

        # 根据策略约束检查
        constraints = policy.constraints

        # 噪音限制检查
        if "noise_max" in constraints:
            noise_max = constraints["noise_max"]
            if action in ["music_play", "tv_on", "speaker_on"]:
                volume = parameters.get("volume", 0)
                if noise_max == "minimum" and volume > 20:
                    return True
                elif noise_max == "low" and volume > 50:
                    return True

        # 灯光限制检查
        if "light_max" in constraints:
            light_max = constraints["light_max"]
            if action in ["light_on", "set_brightness"]:
                brightness = parameters.get("brightness", 100)
                if light_max == "low" and brightness > 30:
                    return True

        # 设备关闭检查
        if constraints.get("all_devices") == "off":
            if action in ["light_on", "tv_on", "speaker_on", "device_on"]:
                return True

        # 音量限制检查（儿童保护）
        if "volume_max" in constraints:
            volume_max = constraints["volume_max"]
            if action in ["music_play", "tv_on", "speaker_on"]:
                volume = parameters.get("volume", 0)
                if volume > volume_max:
                    return True

        return False

    def get_suggested_modification(self, intent: Dict[str, Any], policy: PolicyRule) -> Optional[Dict[str, Any]]:
        """获取策略裁剪建议（降级）

        Args:
            intent: 原始意图
            policy: 违反的策略

        Returns:
            修改后的意图，如果无法降级返回None
        """
        action = intent["action"]
        parameters = intent.get("parameters", {}).copy()

        # 根据策略约束提供降级建议
        constraints = policy.constraints

        # 噪音降级
        if "noise_max" in constraints and action in ["music_play", "tv_on", "speaker_on"]:
            noise_max = constraints["noise_max"]
            if noise_max == "minimum":
                parameters["volume"] = min(parameters.get("volume", 80), 20)
            elif noise_max == "low":
                parameters["volume"] = min(parameters.get("volume", 80), 50)
            return {"action": action, "parameters": parameters}

        # 灯光降级
        if "light_max" in constraints and action in ["light_on", "set_brightness"]:
            light_max = constraints["light_max"]
            if light_max == "low":
                parameters["brightness"] = min(parameters.get("brightness", 100), 30)
            return {"action": action, "parameters": parameters}

        # 音量限制降级
        if "volume_max" in constraints and action in ["music_play", "tv_on", "speaker_on"]:
            volume_max = constraints["volume_max"]
            parameters["volume"] = min(parameters.get("volume", 80), volume_max)
            return {"action": action, "parameters": parameters}

        # 无法降级
        return None

    def register_listener(self, listener: callable):
        """注册策略更新监听器

        Args:
            listener: 监听器函数
        """
        self._policy_listeners.append(listener)
        print(f"[PolicyEngine] Registered policy listener")
