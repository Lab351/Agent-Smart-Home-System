"""全局状态管理器

维护智能家居系统的全局状态，包括：
- 家庭模式（home/away/sleep/vacation）
- 在家状态（anyone_home）
- 活跃用户列表
- 时间上下文（工作日/周末，白天/夜晚）
- 系统风险状态
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from pathlib import Path

from shared.models.mqtt_messages import GlobalStateMessage


class StateManager:
    """全局状态管理器

    职责：
    - 维护系统全局状态
    - 提供状态查询接口
    - 发布状态更新
    - 持久化状态（可选）
    """

    # 家庭模式定义
    HOME_MODES = ["home", "away", "sleep", "vacation"]

    # 风险等级定义
    RISK_LEVELS = ["normal", "warning", "critical"]

    def __init__(self, persistence_path: Optional[str] = None):
        """初始化状态管理器

        Args:
            persistence_path: 状态持久化文件路径（可选）
        """
        # 全局状态
        self.state = {
            "home_mode": "home",
            "occupancy": {
                "anyone_home": False,
                "active_users": [],
                "last_change": None,
            },
            "temporal_context": {
                "day_type": "workday",
                "time_period": "day",
                "timezone": "Asia/Shanghai",
            },
            "risk_level": "normal",
            "version": 0,  # 状态版本号，每次更新递增
        }

        # 持久化配置
        self.persistence_path = persistence_path
        self._persistence_lock = asyncio.Lock()

        # 状态更新监听器
        self._state_listeners: List[callable] = []

        # 从持久化存储加载状态（如果配置）
        if persistence_path:
            self._load_state()

        print(f"[StateManager] Initialized (home_mode={self.state['home_mode']})")

    def _load_state(self):
        """从文件加载状态"""
        try:
            path = Path(self.persistence_path)
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    saved_state = json.load(f)
                    self.state.update(saved_state)
                print(f"[StateManager] Loaded state from {self.persistence_path}")
        except Exception as e:
            print(f"[StateManager] Failed to load state: {e}")

    async def _save_state(self):
        """保存状态到文件"""
        if not self.persistence_path:
            return

        async with self._persistence_lock:
            try:
                path = Path(self.persistence_path)
                path.parent.mkdir(parents=True, exist_ok=True)

                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(self.state, f, indent=2, ensure_ascii=False)

                print(f"[StateManager] Saved state to {self.persistence_path}")
            except Exception as e:
                print(f"[StateManager] Failed to save state: {e}")

    def get_state(self) -> Dict[str, Any]:
        """获取当前全局状态

        Returns:
            全局状态字典
        """
        return self.state.copy()

    def get_home_mode(self) -> str:
        """获取当前家庭模式

        Returns:
            家庭模式（home/away/sleep/vacation）
        """
        return self.state["home_mode"]

    async def set_home_mode(self, mode: str, triggered_by: str = "manual") -> bool:
        """设置家庭模式

        Args:
            mode: 目标模式
            triggered_by: 触发方式（manual/schedule/event）

        Returns:
            是否成功设置
        """
        if mode not in self.HOME_MODES:
            print(f"[StateManager] Invalid home mode: {mode}")
            return False

        old_mode = self.state["home_mode"]
        if old_mode == mode:
            return True  # 无变化

        # 更新模式
        self.state["home_mode"] = mode
        self.state["version"] += 1

        print(f"[StateManager] Home mode changed: {old_mode} -> {mode} (triggered_by={triggered_by})")

        # 持久化状态
        await self._save_state()

        # 通知监听器
        await self._notify_state_change("home_mode", old_mode, mode)

        return True

    def get_active_users(self) -> List[str]:
        """获取活跃用户列表

        Returns:
            用户ID列表
        """
        return self.state["occupancy"]["active_users"].copy()

    async def add_active_user(self, user_id: str):
        """添加活跃用户

        Args:
            user_id: 用户ID
        """
        if user_id not in self.state["occupancy"]["active_users"]:
            self.state["occupancy"]["active_users"].append(user_id)
            self.state["occupancy"]["anyone_home"] = True
            self.state["occupancy"]["last_change"] = datetime.now(timezone.utc).isoformat()
            self.state["version"] += 1

            print(f"[StateManager] User added: {user_id}")
            await self._save_state()
            await self._notify_state_change("user_added", None, user_id)

    async def remove_active_user(self, user_id: str):
        """移除活跃用户

        Args:
            user_id: 用户ID
        """
        if user_id in self.state["occupancy"]["active_users"]:
            self.state["occupancy"]["active_users"].remove(user_id)

            # 如果没有活跃用户，设置anyone_home为False
            if not self.state["occupancy"]["active_users"]:
                self.state["occupancy"]["anyone_home"] = False

            self.state["occupancy"]["last_change"] = datetime.now(timezone.utc).isoformat()
            self.state["version"] += 1

            print(f"[StateManager] User removed: {user_id}")
            await self._save_state()
            await self._notify_state_change("user_removed", user_id, None)

    def is_anyone_home(self) -> bool:
        """检查是否有人在家

        Returns:
            是否有人在家
        """
        return self.state["occupancy"]["anyone_home"]

    def get_risk_level(self) -> str:
        """获取系统风险等级

        Returns:
            风险等级（normal/warning/critical）
        """
        return self.state["risk_level"]

    async def set_risk_level(self, level: str):
        """设置系统风险等级

        Args:
            level: 风险等级
        """
        if level not in self.RISK_LEVELS:
            print(f"[StateManager] Invalid risk level: {level}")
            return

        old_level = self.state["risk_level"]
        if old_level == level:
            return

        self.state["risk_level"] = level
        self.state["version"] += 1

        print(f"[StateManager] Risk level changed: {old_level} -> {level}")
        await self._save_state()
        await self._notify_state_change("risk_level", old_level, level)

    def to_message(self) -> GlobalStateMessage:
        """转换为全局状态消息

        Returns:
            GlobalStateMessage对象
        """
        return GlobalStateMessage(
            message_id=f"global-state-{self.state['version']}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            home_mode=self.state["home_mode"],
            active_users=self.state["occupancy"]["active_users"],
            risk_level=self.state["risk_level"],
            temporal_context=self.state["temporal_context"],
        )

    def register_listener(self, listener: callable):
        """注册状态变化监听器

        Args:
            listener: 监听器函数，签名: async (field, old_value, new_value) -> None
        """
        self._state_listeners.append(listener)
        print(f"[StateManager] Registered state listener")

    async def _notify_state_change(self, field: str, old_value: Any, new_value: Any):
        """通知状态变化

        Args:
            field: 变化的字段
            old_value: 旧值
            new_value: 新值
        """
        for listener in self._state_listeners:
            try:
                if asyncio.iscoroutinefunction(listener):
                    await listener(field, old_value, new_value)
                else:
                    listener(field, old_value, new_value)
            except Exception as e:
                print(f"[StateManager] Listener error: {e}")
