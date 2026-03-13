"""Home Assistant MCP Client

通过 Model Context Protocol (MCP) 连接到 Home Assistant
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class EntityState:
    """Home Assistant 实体状态"""
    entity_id: str
    state: str
    attributes: Dict[str, Any]
    last_changed: str
    last_updated: str


@dataclass
class ServiceCall:
    """Home Assistant 服务调用"""
    domain: str  # e.g., "light", "switch"
    service: str  # e.g., "turn_on", "turn_off"
    service_data: Dict[str, Any]
    entity_id: Optional[str] = None


class HomeAssistantMCPClient:
    """Home Assistant MCP 客户端

    职责：
    - 连接到 Home Assistant MCP Server
    - 读取实体状态
    - 调用服务
    - 监听事件
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Args:
            config: 配置字典
                - server_url: MCP Server URL (e.g., "ws://localhost:3000/sse")
                - api_key: Home Assistant API Key
                - entities: 监听的实体列表
                - services: 可调用的服务列表
        """
        self.config = config
        self.server_url = config.get("server_url", "ws://localhost:3000/sse")
        self.api_key = config.get("api_key", "")
        self.entities = config.get("entities", [])
        self.services = config.get("services", [])

        # 连接状态
        self._connected = False
        self._ws = None
        self._should_reconnect = True

        # 状态缓存
        self._states: Dict[str, EntityState] = {}

        # 事件监听器
        self._state_listeners: List[Callable[[EntityState], None]] = []

        logger.info(f"[HomeAssistantMCPClient] Initialized (server={self.server_url})")

    async def connect(self) -> bool:
        """连接到 MCP Server

        Returns:
            是否连接成功
        """
        try:
            # 使用 websockets 连接
            import websockets

            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }

            logger.info(f"[HomeAssistantMCPClient] Connecting to {self.server_url}...")
            self._ws = await websockets.connect(
                self.server_url,
                extra_headers=headers
            )

            self._connected = True
            logger.info("[HomeAssistantMCPClient] Connected successfully")

            # 启动消息处理循环
            asyncio.create_task(self._message_loop())

            # 初始化：订阅所有实体
            await self._subscribe_entities()

            return True

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] Connection failed: {e}")
            self._connected = False
            return False

    async def disconnect(self):
        """断开连接"""
        self._should_reconnect = False

        if self._ws:
            await self._ws.close()
            self._ws = None

        self._connected = False
        logger.info("[HomeAssistantMCPClient] Disconnected")

    async def _message_loop(self):
        """消息处理循环"""
        try:
            while self._connected and self._ws:
                try:
                    message = await self._ws.recv()
                    await self._handle_message(json.loads(message))
                except Exception as e:
                    logger.error(f"[HomeAssistantMCPClient] Message error: {e}")

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] Message loop error: {e}")

        # 自动重连
        if self._should_reconnect:
            logger.info("[HomeAssistantMCPClient] Reconnecting...")
            await asyncio.sleep(5)
            await self.connect()

    async def _handle_message(self, message: Dict[str, Any]):
        """处理收到的消息

        Args:
            message: MCP 消息
        """
        msg_type = message.get("type", "")

        if msg_type == "state_changed":
            await self._handle_state_changed(message)
        elif msg_type == "event":
            await self._handle_event(message)
        elif msg_type == "response":
            # 响应消息，可以在这里处理
            pass
        else:
            logger.debug(f"[HomeAssistantMCPClient] Unknown message type: {msg_type}")

    async def _handle_state_changed(self, message: Dict[str, Any]):
        """处理状态变化

        Args:
            message: 状态变化消息
        """
        try:
            event = message.get("event", {})
            entity_id = event.get("entity_id")
            new_state = event.get("new_state", {})

            if not entity_id or not new_state:
                return

            # 构造 EntityState
            state = EntityState(
                entity_id=entity_id,
                state=new_state.get("state", "unknown"),
                attributes=new_state.get("attributes", {}),
                last_changed=new_state.get("last_changed", ""),
                last_updated=new_state.get("last_updated", "")
            )

            # 更新缓存
            self._states[entity_id] = state

            # 通知监听器
            for listener in self._state_listeners:
                try:
                    listener(state)
                except Exception as e:
                    logger.error(f"[HomeAssistantMCPClient] Listener error: {e}")

            logger.debug(f"[HomeAssistantMCPClient] State changed: {entity_id} -> {state.state}")

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] State change error: {e}")

    async def _handle_event(self, message: Dict[str, Any]):
        """处理事件

        Args:
            message: 事件消息
        """
        try:
            event = message.get("event", {})
            event_type = event.get("event_type")

            logger.debug(f"[HomeAssistantMCPClient] Event: {event_type}")

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] Event error: {e}")

    async def _subscribe_entities(self):
        """订阅实体状态"""
        try:
            # 发送订阅请求
            subscribe_message = {
                "type": "subscribe",
                "entities": self.entities
            }

            await self._ws.send(json.dumps(subscribe_message))
            logger.info(f"[HomeAssistantMCPClient] Subscribed to {len(self.entities)} entities")

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] Subscribe error: {e}")

    async def call_service(self, service: ServiceCall) -> bool:
        """调用 Home Assistant 服务

        Args:
            service: 服务调用对象

        Returns:
            是否调用成功
        """
        try:
            # 构造服务调用消息
            service_message = {
                "type": "call_service",
                "domain": service.domain,
                "service": service.service,
                "service_data": service.service_data
            }

            if service.entity_id:
                service_message["entity_id"] = service.entity_id

            await self._ws.send(json.dumps(service_message))
            logger.info(f"[HomeAssistantMCPClient] Called service: {service.domain}.{service.service}")
            return True

        except Exception as e:
            logger.error(f"[HomeAssistantMCPClient] Service call error: {e}")
            return False

    async def get_state(self, entity_id: str) -> Optional[EntityState]:
        """获取实体状态

        Args:
            entity_id: 实体ID

        Returns:
            实体状态，如果不存在返回None
        """
        return self._states.get(entity_id)

    async def get_all_states(self) -> Dict[str, EntityState]:
        """获取所有实体状态

        Returns:
            所有实体状态的字典
        """
        return self._states.copy()

    def register_state_listener(self, listener: Callable[[EntityState], None]):
        """注册状态监听器

        Args:
            listener: 状态变化回调函数
        """
        self._state_listeners.append(listener)
        logger.debug(f"[HomeAssistantMCPClient] Registered state listener (total: {len(self._state_listeners)})")

    def is_connected(self) -> bool:
        """是否已连接"""
        return self._connected
