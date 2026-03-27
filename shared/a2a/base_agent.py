# shared/a2a/base_agent.py
"""A2A 通用基类

提供 Agent-to-Agent 通信的标准接口和通用实现
"""

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, Optional

from shared.mqtt.client_manager import MqttClientManager
from shared.mqtt.topic_manager import TopicManager, TopicType, AgentType
from shared.mqtt.message_handler import MessageHandler
from shared.mqtt.request_response import RequestResponseManager
from shared.mqtt.event_dispatcher import EventDispatcher, Event
from shared.models.mqtt_messages import DescriptionMessage


class BaseA2AAgent(ABC):
    """A2A Agent 基类
    
    提供 Agent-to-Agent 通信的标准接口，包括：
    - MQTT 连接管理
    - 消息发送和接收
    - 请求-响应模式
    - 事件分发
    - 心跳管理
    
    子类需要实现：
    - _get_agent_type(): 返回 Agent 类型
    - _setup_subscriptions(): 设置订阅
    - _handle_message(): 处理接收到的消息
    
    Examples:
        >>> class MyAgent(BaseA2AAgent):
        ...     def _get_agent_type(self):
        ...         return AgentType.ROOM
        ...     
        ...     async def start(self):
        ...         await super().start()
        ...         # 自定义初始化
    """
    
    def __init__(
        self,
        agent_id: str,
        broker_config: Dict[str, Any],
        room_id: Optional[str] = None,
    ):
        """初始化 A2A Agent
        
        Args:
            agent_id: Agent ID
            broker_config: MQTT Broker 配置
                - host: Broker 地址
                - port: Broker 端口
                - username: 用户名（可选）
                - password: 密码（可选）
            room_id: 房间 ID（Room Agent 使用）
        """
        self.agent_id = agent_id
        self.room_id = room_id
        self.broker_config = broker_config
        
        # Agent 类型（由子类实现）
        self.agent_type = self._get_agent_type()
        
        # 核心组件
        self.topic_manager = TopicManager()
        self.mqtt_client = MqttClientManager(
            agent_id=agent_id,
            broker_config=broker_config,
            topic_prefix=f"agent/{agent_id}"
        )
        
        # 消息处理器
        self.message_handler = MessageHandler(
            agent_id=agent_id,
            topic_manager=self.topic_manager,
            mqtt_publish_func=self._publish_message
        )
        
        # 请求-响应管理器
        self.request_response_manager = RequestResponseManager()
        
        # 事件分发器
        self.event_dispatcher = EventDispatcher()
        
        # 运行状态
        self._running = False
        self._start_time: Optional[float] = None
        
        # 心跳配置
        self.heartbeat_interval = 30  # 秒
        self._heartbeat_task: Optional[asyncio.Task] = None
        
        print(f"[{self.__class__.__name__}] Initialized for {agent_id}")
    
    @abstractmethod
    def _get_agent_type(self) -> AgentType:
        """获取 Agent 类型（由子类实现）
        
        Returns:
            Agent 类型
        """
        pass
    
    @abstractmethod
    async def _setup_subscriptions(self):
        """设置订阅（由子类实现）
        
        子类应该在此方法中订阅相关的 topics
        """
        pass
    
    @abstractmethod
    async def _handle_message(self, topic: str, message: Any):
        """处理接收到的消息（由子类实现）
        
        Args:
            topic: Topic 字符串
            message: 消息对象（已反序列化）
        """
        pass
    
    async def start(self):
        """启动 Agent"""
        if self._running:
            print(f"[{self.__class__.__name__}] Agent already running")
            return
        
        print(f"[{self.__class__.__name__}] Starting {self.agent_id}...")
        
        # 连接到 MQTT Broker
        connected = await self.mqtt_client.connect()
        if not connected:
            raise RuntimeError(f"Failed to connect to MQTT broker")
        
        # 注册原始消息处理器
        self._setup_message_handler()

        # 设置订阅
        await self._setup_subscriptions()

        self._running = True
        self._start_time = time.time()

        # 启动请求-响应管理器的清理任务
        await self.request_response_manager.start_cleanup_task()
        
        # 启动心跳
        self._start_heartbeat()
        
        print(f"[{self.__class__.__name__}] Started successfully")
    
    async def stop(self):
        """停止 Agent"""
        if not self._running:
            return
        
        print(f"[{self.__class__.__name__}] Stopping {self.agent_id}...")
        
        # 停止心跳
        await self._stop_heartbeat()
        
        # 停止请求-响应管理器
        await self.request_response_manager.close()
        
        # 断开 MQTT 连接
        await self.mqtt_client.disconnect()
        
        self._running = False
        self._start_time = None
        
        print(f"[{self.__class__.__name__}] Stopped")
    
    def _setup_message_handler(self):
        """注册原始 MQTT 消息处理器。"""
        self.mqtt_client.set_message_handler(self._handle_raw_message)
    
    async def _handle_raw_message(self, topic: str, payload: str):
        """处理原始 MQTT 消息
        
        Args:
            topic: Topic 字符串
            payload: 消息内容
        """
        # 反序列化消息
        message = self.message_handler.deserialize_message(topic, payload)
        
        if message:
            topic_info = self.topic_manager.parse_topic(topic)

            # 检查是否是响应消息（需要匹配 correlation_id）
            response_key = self._get_response_key(topic_info, message)
            if response_key:
                # 尝试匹配请求-响应
                matched = self.request_response_manager.handle_response(
                    response_key,
                    message
                )
                
                if matched:
                    # 已匹配到请求，不需要进一步处理
                    return

            if topic_info and topic_info.topic_type == TopicType.ARBITRATION_RESPONSE:
                print(
                    f"[{self.__class__.__name__}] Ignoring unmatched arbitration "
                    f"response: {response_key}"
                )
                return
            
            # 分发给具体的消息处理器
            await self._handle_message(topic, message)
            
            # 触发事件
            if topic_info:
                await self.event_dispatcher.emit(
                    event_type=topic_info.topic_type.value,
                    data=message,
                    source=self.agent_id
                )

    def _get_response_key(self, topic_info, message: Any) -> Optional[str]:
        """根据消息语义提取请求-响应匹配键。"""
        if topic_info and topic_info.topic_type == TopicType.ARBITRATION_RESPONSE:
            return getattr(message, "request_id", None) or topic_info.correlation_id

        return getattr(message, "correlation_id", None)
    
    async def _publish_message(self, topic: str, payload: str, qos: int):
        """发布消息（内部方法）
        
        Args:
            topic: Topic 字符串
            payload: 消息内容
            qos: QoS 级别
        """
        await self.mqtt_client.publish(topic, payload, qos)
    
    def _start_heartbeat(self):
        """启动心跳任务"""
        if self._heartbeat_task and not self._heartbeat_task.done():
            return
        
        async def heartbeat_loop():
            while self._running:
                try:
                    await self._send_heartbeat()
                    await asyncio.sleep(self.heartbeat_interval)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[{self.__class__.__name__}] Heartbeat error: {e}")
                    await asyncio.sleep(5)  # 错误后等待5秒
        
        self._heartbeat_task = asyncio.create_task(heartbeat_loop())
    
    async def _stop_heartbeat(self):
        """停止心跳任务"""
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
    
    async def _send_heartbeat(self):
        """发送心跳消息（由子类实现具体逻辑）"""
        return None
    
    def get_uptime(self) -> int:
        """获取运行时间（秒）
        
        Returns:
            运行时间
        """
        if self._start_time:
            return int(time.time() - self._start_time)
        return 0
    
    @property
    def is_running(self) -> bool:
        """检查是否正在运行"""
        return self._running
    
    @property
    def is_connected(self) -> bool:
        """检查是否已连接到 MQTT Broker"""
        return self.mqtt_client.is_connected
    
    # ==================== 便捷的消息发送方法 ====================
    
    async def send_control(
        self,
        room_id: str,
        target_device: str,
        action: str,
        parameters: Optional[Dict[str, Any]] = None,
        target_agent_id: Optional[str] = None
    ) -> str:
        """发送控制消息
        
        Args:
            room_id: 房间 ID
            target_device: 目标设备 ID
            action: 动作
            parameters: 参数
            target_agent_id: 目标 Agent ID
            
        Returns:
            消息 ID
        """
        return await self.message_handler.send_control(
            room_id=room_id,
            target_device=target_device,
            action=action,
            parameters=parameters,
            target_agent_id=target_agent_id
        )
    
    async def request_describe(
        self,
        room_id: str,
        target_agent_id: str,
        timeout: float = 5.0
    ) -> DescriptionMessage:
        """请求能力描述（带响应）
        
        Args:
            room_id: 房间 ID
            target_agent_id: 目标 Agent ID
            timeout: 超时时间
            
        Returns:
            能力描述消息
            
        Raises:
            asyncio.TimeoutError: 超时
        """
        # 生成 correlation_id
        correlation_id = self.request_response_manager.generate_correlation_id()
        
        # 构建响应 topic
        response_topic = self.topic_manager.build_description_topic(room_id, target_agent_id)
        
        # 订阅响应 topic
        self.mqtt_client.subscribe(response_topic, qos=1)
        
        # 发送请求并等待响应
        try:
            self.request_response_manager.create_request(
                correlation_id=correlation_id,
                topic=response_topic,
                message={"query_type": "capabilities"},
                timeout=timeout,
            )

            await self.message_handler.send_describe(
                room_id=room_id,
                target_agent_id=target_agent_id,
                query_type="capabilities",
                correlation_id=correlation_id
            )

            return await self.request_response_manager.wait_for_response(
                correlation_id,
                timeout=timeout,
            )
        except Exception:
            self.request_response_manager.cancel_request(correlation_id, "Describe request failed")
            raise
            
        finally:
            # 取消订阅
            # 注意：实际使用中可能不需要取消订阅，因为可能频繁请求
            pass
    
    # ==================== 事件便捷方法 ====================
    
    def on(self, event_type: str, callback: Optional[Callable] = None):
        """注册事件监听器
        
        Args:
            event_type: 事件类型
            callback: 回调函数
            
        Returns:
            装饰器或 None
        """
        return self.event_dispatcher.on(event_type, callback)
    
    def once(self, event_type: str, callback: Optional[Callable] = None):
        """注册一次性事件监听器
        
        Args:
            event_type: 事件类型
            callback: 回调函数
            
        Returns:
            装饰器或 None
        """
        return self.event_dispatcher.once(event_type, callback)
    
    async def emit(self, event_type: str, data: Any = None):
        """触发事件
        
        Args:
            event_type: 事件类型
            data: 事件数据
        """
        await self.event_dispatcher.emit(event_type, data, self.agent_id)
    
    # ==================== 上下文管理器支持 ====================
    
    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        await self.stop()
        return False
