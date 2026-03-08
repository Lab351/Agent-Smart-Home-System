# shared/mqtt/request_response.py
"""MQTT 请求-响应管理器

实现基于 Correlation ID 的请求-响应模式
"""

import asyncio
import uuid
import time
from typing import Dict, Optional, Any, Callable
from dataclasses import dataclass
from enum import Enum


class RequestState(str, Enum):
    """请求状态"""
    PENDING = "pending"
    COMPLETED = "completed"
    TIMEOUT = "timeout"
    ERROR = "error"


@dataclass
class PendingRequest:
    """待处理的请求"""
    correlation_id: str
    topic: str
    message: Dict[str, Any]
    future: asyncio.Future
    created_at: float
    timeout: float
    state: RequestState = RequestState.PENDING
    response: Optional[Any] = None
    error: Optional[Exception] = None


class RequestResponseManager:
    """请求-响应管理器
    
    实现基于 Correlation ID 的请求-响应模式，支持：
    - 异步等待响应
    - 超时处理
    - 请求追踪
    - 自动清理过期请求
    
    Examples:
        >>> manager = RequestResponseManager()
        >>> 
        >>> # 发送请求并等待响应
        >>> correlation_id = manager.generate_correlation_id()
        >>> response = await manager.send_request(
        ...     correlation_id=correlation_id,
        ...     publish_func=mqtt_client.publish,
        ...     topic="room/bedroom/agent/room-1/describe",
        ...     message={"query_type": "capabilities"},
        ...     timeout=5.0
        ... )
        >>> 
        >>> # 处理响应
        >>> manager.handle_response(correlation_id, response_data)
    """
    
    def __init__(self, default_timeout: float = 5.0):
        """初始化请求-响应管理器
        
        Args:
            default_timeout: 默认超时时间（秒）
        """
        self.default_timeout = default_timeout
        
        # 存储待处理的请求：correlation_id -> PendingRequest
        self.pending_requests: Dict[str, PendingRequest] = {}
        
        # 响应回调注册表
        self.response_callbacks: Dict[str, Callable] = {}
        
        # 清理任务
        self._cleanup_task: Optional[asyncio.Task] = None
        
        print(f"[RequestResponseManager] Initialized with default timeout={default_timeout}s")
    
    def generate_correlation_id(self) -> str:
        """生成唯一的 correlation ID
        
        Returns:
            UUID 格式的 correlation ID
        """
        return str(uuid.uuid4())
    
    async def send_request(
        self,
        correlation_id: str,
        publish_func: Callable,
        topic: str,
        message: Dict[str, Any],
        timeout: Optional[float] = None,
        response_topic: Optional[str] = None
    ) -> Any:
        """发送请求并等待响应
        
        Args:
            correlation_id: 关联 ID
            publish_func: MQTT 发布函数（异步）
            topic: 请求 topic
            message: 请求消息（字典）
            timeout: 超时时间（秒），None 使用默认值
            response_topic: 响应 topic（可选，用于订阅）
            
        Returns:
            响应数据
            
        Raises:
            asyncio.TimeoutError: 超时
            Exception: 其他错误
        """
        timeout = timeout or self.default_timeout
        
        # 创建 Future
        future = asyncio.Future()
        
        # 创建待处理请求记录
        pending_request = PendingRequest(
            correlation_id=correlation_id,
            topic=topic,
            message=message,
            future=future,
            created_at=time.time(),
            timeout=timeout
        )
        
        # 存储请求
        self.pending_requests[correlation_id] = pending_request
        
        try:
            # 添加 correlation_id 到消息
            message["correlation_id"] = correlation_id
            
            # 发送请求
            await publish_func(topic, message)
            
            print(f"[RequestResponseManager] Sent request {correlation_id} to {topic}")
            
            # 等待响应
            response = await asyncio.wait_for(future, timeout=timeout)
            
            # 更新状态
            pending_request.state = RequestState.COMPLETED
            pending_request.response = response
            
            return response
            
        except asyncio.TimeoutError:
            # 超时
            pending_request.state = RequestState.TIMEOUT
            pending_request.error = asyncio.TimeoutError(
                f"Request {correlation_id} timeout after {timeout}s"
            )
            print(f"[RequestResponseManager] Request {correlation_id} timeout")
            raise
            
        except Exception as e:
            # 错误
            pending_request.state = RequestState.ERROR
            pending_request.error = e
            print(f"[RequestResponseManager] Request {correlation_id} error: {e}")
            raise
            
        finally:
            # 清理请求
            self.pending_requests.pop(correlation_id, None)
    
    def handle_response(self, correlation_id: str, response: Any) -> bool:
        """处理响应
        
        当收到响应消息时调用此方法，匹配 correlation_id 并设置 Future 结果
        
        Args:
            correlation_id: 关联 ID
            response: 响应数据
            
        Returns:
            是否成功匹配到请求
        """
        # 查找对应的待处理请求
        pending_request = self.pending_requests.get(correlation_id)
        
        if pending_request:
            # 找到匹配的请求
            if not pending_request.future.done():
                # Future 未完成，设置结果
                pending_request.future.set_result(response)
                print(f"[RequestResponseManager] Matched response for request {correlation_id}")
                return True
            else:
                # Future 已完成（可能已超时）
                print(f"[RequestResponseManager] Request {correlation_id} already completed")
                return False
        else:
            # 未找到匹配的请求
            print(f"[RequestResponseManager] No matching request for correlation_id {correlation_id}")
            
            # 尝试调用注册的回调
            callback = self.response_callbacks.get(correlation_id)
            if callback:
                try:
                    callback(response)
                except Exception as e:
                    print(f"[RequestResponseManager] Callback error: {e}")
            
            return False
    
    def register_response_callback(self, correlation_id: str, callback: Callable):
        """注册响应回调
        
        为特定的 correlation_id 注册回调，当收到响应时调用
        
        Args:
            correlation_id: 关联 ID
            callback: 回调函数
        """
        self.response_callbacks[correlation_id] = callback
        print(f"[RequestResponseManager] Registered callback for {correlation_id}")
    
    def unregister_response_callback(self, correlation_id: str):
        """取消注册响应回调
        
        Args:
            correlation_id: 关联 ID
        """
        self.response_callbacks.pop(correlation_id, None)
        print(f"[RequestResponseManager] Unregistered callback for {correlation_id}")
    
    def cancel_request(self, correlation_id: str, reason: str = "Cancelled"):
        """取消请求
        
        Args:
            correlation_id: 关联 ID
            reason: 取消原因
        """
        pending_request = self.pending_requests.get(correlation_id)
        
        if pending_request:
            if not pending_request.future.done():
                pending_request.future.cancel()
                pending_request.state = RequestState.ERROR
                pending_request.error = Exception(reason)
            
            self.pending_requests.pop(correlation_id, None)
            print(f"[RequestResponseManager] Cancelled request {correlation_id}: {reason}")
    
    def get_pending_request_count(self) -> int:
        """获取待处理请求数量
        
        Returns:
            待处理请求数量
        """
        return len(self.pending_requests)
    
    def get_request_state(self, correlation_id: str) -> Optional[RequestState]:
        """获取请求状态
        
        Args:
            correlation_id: 关联 ID
            
        Returns:
            请求状态，不存在返回 None
        """
        pending_request = self.pending_requests.get(correlation_id)
        return pending_request.state if pending_request else None
    
    async def cleanup_expired_requests(self, max_age: float = 60.0):
        """清理过期的请求
        
        Args:
            max_age: 最大存活时间（秒）
        """
        current_time = time.time()
        expired_ids = []
        
        for correlation_id, pending_request in self.pending_requests.items():
            age = current_time - pending_request.created_at
            
            if age > max_age:
                expired_ids.append(correlation_id)
                
                if not pending_request.future.done():
                    pending_request.future.set_exception(
                        TimeoutError(f"Request expired after {age:.1f}s")
                    )
                    pending_request.state = RequestState.TIMEOUT
        
        # 删除过期请求
        for correlation_id in expired_ids:
            self.pending_requests.pop(correlation_id, None)
        
        if expired_ids:
            print(f"[RequestResponseManager] Cleaned up {len(expired_ids)} expired requests")
    
    async def start_cleanup_task(self, interval: float = 30.0):
        """启动定期清理任务
        
        Args:
            interval: 清理间隔（秒）
        """
        if self._cleanup_task and not self._cleanup_task.done():
            print("[RequestResponseManager] Cleanup task already running")
            return
        
        async def cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(interval)
                    await self.cleanup_expired_requests()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[RequestResponseManager] Cleanup error: {e}")
        
        self._cleanup_task = asyncio.create_task(cleanup_loop())
        print(f"[RequestResponseManager] Started cleanup task (interval={interval}s)")
    
    async def stop_cleanup_task(self):
        """停止定期清理任务"""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            
            print("[RequestResponseManager] Stopped cleanup task")
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息
        
        Returns:
            统计信息字典
        """
        state_counts = {}
        for pending_request in self.pending_requests.values():
            state = pending_request.state.value
            state_counts[state] = state_counts.get(state, 0) + 1
        
        return {
            "total_pending": len(self.pending_requests),
            "state_distribution": state_counts,
            "callbacks_registered": len(self.response_callbacks)
        }
    
    async def close(self):
        """关闭管理器，清理资源"""
        # 停止清理任务
        await self.stop_cleanup_task()
        
        # 取消所有待处理的请求
        for correlation_id in list(self.pending_requests.keys()):
            self.cancel_request(correlation_id, "Manager closing")
        
        # 清空回调
        self.response_callbacks.clear()
        
        print("[RequestResponseManager] Closed")