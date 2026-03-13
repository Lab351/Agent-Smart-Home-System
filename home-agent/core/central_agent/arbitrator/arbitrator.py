"""冲突仲裁器

处理Agent间的冲突仲裁：
- 多用户意图冲突
- 策略违规冲突
- 资源竞争冲突
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from shared.models.mqtt_messages import ArbitrationRequestMessage, ArbitrationResponseMessage


class DecisionType(str, Enum):
    """仲裁决策类型"""
    ACCEPT = "accept"  # 完全接受
    REJECT = "reject"  # 完全拒绝
    PARTIAL_ACCEPT = "partial_accept"  # 部分接受（降级执行）
    DEFER = "defer"  # 延迟执行


class ConflictType(str, Enum):
    """冲突类型"""
    MULTI_USER_INTENT = "multi_user_intent"  # 多用户意图冲突
    POLICY_VIOLATION = "policy_violation"  # 策略违规
    RESOURCE_COMPETITION = "resource_competition"  # 资源竞争


@dataclass
class User:
    """用户定义"""
    user_id: str
    role: str  # admin/adult/child
    priority: int  # 优先级（0-100）


class Arbitrator:
    """冲突仲裁器

    职责：
    - 接收仲裁请求
    - 分析冲突类型
    - 基于规则做出仲裁决策
    - 返回仲裁结果
    """

    def __init__(self):
        """初始化仲裁器"""
        # 用户优先级配置
        self.users: Dict[str, User] = {}

        # 仲裁历史（用于审计）
        self.arbitration_history: List[Dict[str, Any]] = []

        # 加载默认用户配置
        self._load_default_users()

        print(f"[Arbitrator] Initialized with {len(self.users)} users")

    def _load_default_users(self):
        """加载默认用户配置"""
        self.users = {
            "admin": User(user_id="admin", role="admin", priority=100),
            "adult": User(user_id="adult", role="adult", priority=80),
            "child": User(user_id="child", role="child", priority=50),
        }

    def add_user(self, user: User):
        """添加用户

        Args:
            user: 用户定义
        """
        self.users[user.user_id] = user
        print(f"[Arbitrator] Added user: {user.user_id} (role={user.role}, priority={user.priority})")

    def get_user(self, user_id: str) -> Optional[User]:
        """获取用户

        Args:
            user_id: 用户ID

        Returns:
            用户定义，如果不存在返回None
        """
        return self.users.get(user_id)

    async def arbitrate(self, request: ArbitrationRequestMessage, policy_engine) -> ArbitrationResponseMessage:
        """执行仲裁

        Args:
            request: 仲裁请求
            policy_engine: 策略引擎实例

        Returns:
            仲裁响应
        """
        print(f"[Arbitrator] Processing arbitration request: {request.message_id}")
        print(f"[Arbitrator]   Conflict type: {request.conflict_type}")
        print(f"[Arbitrator]   Requesting agent: {request.requesting_agent}")

        decision = None
        reason = ""
        suggestion = None
        modified_action = None

        # 根据冲突类型执行仲裁
        conflict_type = ConflictType(request.conflict_type)

        if conflict_type == ConflictType.POLICY_VIOLATION:
            decision, reason, modified_action = await self._arbitrate_policy_violation(
                request, policy_engine
            )
        elif conflict_type == ConflictType.MULTI_USER_INTENT:
            decision, reason = await self._arbitrate_multi_user_intent(request)
        elif conflict_type == ConflictType.RESOURCE_COMPETITION:
            decision, reason = await self._arbitrate_resource_competition(request)
        else:
            decision = DecisionType.REJECT
            reason = "unknown_conflict_type"

        # 生成建议
        if decision == DecisionType.REJECT:
            suggestion = self._generate_rejection_suggestion(request.intent, reason)
        elif decision == DecisionType.PARTIAL_ACCEPT:
            suggestion = "Action modified to comply with policy"

        # 构建响应
        response = ArbitrationResponseMessage(
            message_id=f"arbitration-response-{uuid.uuid4()}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            request_id=request.message_id,
            decision=decision.value,
            reason=reason,
            suggestion=suggestion,
            modified_action=modified_action,
        )

        # 记录仲裁历史
        self._record_arbitration(request, response)

        print(f"[Arbitrator] Arbitration decision: {decision.value}")
        print(f"[Arbitrator]   Reason: {reason}")

        return response

    async def _arbitrate_policy_violation(self, request: ArbitrationRequestMessage, policy_engine) -> Tuple[DecisionType, str, Optional[Dict[str, Any]]]:
        """仲裁策略违规

        Args:
            request: 仲裁请求
            policy_engine: 策略引擎

        Returns:
            (决策, 原因, 修改后的动作)
        """
        intent = request.intent
        context = request.context

        # 检查是否违反策略
        violates, policy = policy_engine.check_intent(intent, context)

        if not violates:
            # 不违反策略，直接接受
            return DecisionType.ACCEPT, "no_policy_violation", None

        # 违反策略，尝试降级
        modified_intent = policy_engine.get_suggested_modification(intent, policy)

        if modified_intent:
            # 可以降级执行
            return (
                DecisionType.PARTIAL_ACCEPT,
                f"policy_violation: {policy.name}",
                modified_intent
            )
        else:
            # 无法降级，拒绝执行
            return (
                DecisionType.REJECT,
                f"policy_violation_cannot_modify: {policy.name}",
                None
            )

    async def _arbitrate_multi_user_intent(self, request: ArbitrationRequestMessage) -> Tuple[DecisionType, str]:
        """仲裁多用户意图冲突

        Args:
            request: 仲裁请求

        Returns:
            (决策, 原因)
        """
        requesting_agent = request.requesting_agent
        conflicting_agents = request.conflicting_agents

        # 获取用户优先级
        requesting_user = self._extract_user_id(requesting_agent)
        requesting_priority = self._get_user_priority(requesting_user)

        # 如果没有冲突的Agent，直接接受
        if not conflicting_agents:
            return DecisionType.ACCEPT, "no_conflict"

        # 获取冲突用户的优先级
        max_conflict_priority = 0
        for agent in conflicting_agents:
            user_id = self._extract_user_id(agent)
            priority = self._get_user_priority(user_id)
            max_conflict_priority = max(max_conflict_priority, priority)

        # 比较优先级
        if requesting_priority > max_conflict_priority:
            return DecisionType.ACCEPT, "user_priority_higher"
        elif requesting_priority < max_conflict_priority:
            return DecisionType.REJECT, "user_priority_lower"
        else:
            # 优先级相同，接受最新的请求
            return DecisionType.ACCEPT, "user_priority_equal_latest"

    async def _arbitrate_resource_competition(self, request: ArbitrationRequestMessage) -> Tuple[DecisionType, str]:
        """仲裁资源竞争

        Args:
            request: 仲裁请求

        Returns:
            (决策, 原因)
        """
        # 简单实现：接受请求，但延迟执行
        return DecisionType.DEFER, "resource_busy_defer_execution"

    def _extract_user_id(self, agent_id: str) -> str:
        """从Agent ID提取用户ID

        Args:
            agent_id: Agent ID（格式: personal-agent-{user_id}）

        Returns:
            用户ID
        """
        # 假设Agent ID格式为 "personal-agent-{user_id}"
        parts = agent_id.split("-")
        if len(parts) >= 3 and parts[0] == "personal" and parts[1] == "agent":
            return "-".join(parts[2:])
        return "adult"  # 默认返回adult

    def _get_user_priority(self, user_id: str) -> int:
        """获取用户优先级

        Args:
            user_id: 用户ID

        Returns:
            优先级（0-100）
        """
        user = self.users.get(user_id)
        if user:
            return user.priority

        # 默认优先级（基于用户ID）
        if "admin" in user_id:
            return 100
        elif "child" in user_id:
            return 50
        else:
            return 80  # 默认为adult优先级

    def _generate_rejection_suggestion(self, intent: Dict[str, Any], reason: str) -> str:
        """生成拒绝建议

        Args:
            intent: 用户意图
            reason: 拒绝原因

        Returns:
            建议文本
        """
        if "policy_violation" in reason:
            action = intent.get("action", "action")
            return f"Cannot perform '{action}' due to active policy. Please try a different action or wait for mode change."
        elif "user_priority" in reason:
            return "Another user with higher priority has conflicting intent."
        else:
            return "Action cannot be performed at this time."

    def _record_arbitration(self, request: ArbitrationRequestMessage, response: ArbitrationResponseMessage):
        """记录仲裁历史

        Args:
            request: 仲裁请求
            response: 仲裁响应
        """
        record = {
            "timestamp": response.timestamp,
            "request_id": request.message_id,
            "conflict_type": request.conflict_type,
            "requesting_agent": request.requesting_agent,
            "decision": response.decision,
            "reason": response.reason,
        }

        self.arbitration_history.append(record)

        # 限制历史记录数量（保留最近1000条）
        if len(self.arbitration_history) > 1000:
            self.arbitration_history = self.arbitration_history[-1000:]

    def get_arbitration_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """获取仲裁历史

        Args:
            limit: 返回记录数量限制

        Returns:
            仲裁历史记录列表
        """
        return self.arbitration_history[-limit:]
