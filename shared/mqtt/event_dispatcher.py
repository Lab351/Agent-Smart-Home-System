# shared/mqtt/event_dispatcher.py
"""事件分发器

提供事件监听、注册和分发机制
"""

import asyncio
from typing import Dict, List, Callable, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


class EventPriority(int, Enum):
    """事件处理器优先级"""
    HIGHEST = 0
    HIGH = 25
    NORMAL = 50
    LOW = 75
    LOWEST = 100


@dataclass
class EventHandler:
    """事件处理器"""
    callback: Callable
    priority: int = EventPriority.NORMAL
    once: bool = False  # 是否只触发一次
    enabled: bool = True
    call_count: int = 0
    last_called: Optional[datetime] = None


@dataclass
class Event:
    """事件对象"""
    event_type: str
    data: Any
    timestamp: datetime = field(default_factory=datetime.utcnow)
    source: Optional[str] = None
    cancelled: bool = False
    
    def cancel(self):
        """取消事件传播"""
        self.cancelled = True


class EventDispatcher:
    """事件分发器
    
    提供灵活的事件监听和分发机制，支持：
    - 多个监听器
    - 优先级
    - 一次性监听器
    - 异步回调
    - 事件取消
    
    Examples:
        >>> dispatcher = EventDispatcher()
        >>> 
        >>> # 注册事件监听器
        >>> @dispatcher.on("device_control")
        ... async def handle_control(event: Event):
        ...     print(f"Control event: {event.data}")
        >>> 
        >>> # 触发事件
        >>> await dispatcher.emit("device_control", {"device": "light_1", "action": "on"})
        >>> 
        >>> # 一次性监听器
        >>> @dispatcher.once("connected")
        ... def on_connected(event):
        ...     print("Connected!")
    """
    
    def __init__(self):
        """初始化事件分发器"""
        # 事件处理器注册表：event_type -> [EventHandler]
        self.handlers: Dict[str, List[EventHandler]] = {}
        
        # 全局事件处理器（接收所有事件）
        self.global_handlers: List[EventHandler] = []
        
        # 事件队列（用于异步处理）
        self.event_queue: asyncio.Queue = asyncio.Queue()
        
        # 处理任务
        self._process_task: Optional[asyncio.Task] = None
        
        print("[EventDispatcher] Initialized")
    
    def on(
        self, 
        event_type: str, 
        callback: Optional[Callable] = None,
        priority: int = EventPriority.NORMAL
    ):
        """注册事件监听器
        
        Args:
            event_type: 事件类型
            callback: 回调函数（可选，用于装饰器模式）
            priority: 优先级
            
        Returns:
            装饰器函数或 None
            
        Examples:
            >>> # 装饰器模式
            >>> @dispatcher.on("device_control")
            ... async def handle_control(event):
            ...     pass
            >>> 
            >>> # 函数调用模式
            >>> dispatcher.on("device_control", handle_control)
        """
        def decorator(func: Callable) -> Callable:
            handler = EventHandler(
                callback=func,
                priority=priority,
                once=False
            )
            
            if event_type not in self.handlers:
                self.handlers[event_type] = []
            
            self.handlers[event_type].append(handler)
            
            # 按优先级排序（数字小的优先）
            self.handlers[event_type].sort(key=lambda h: h.priority)
            
            print(f"[EventDispatcher] Registered handler for '{event_type}' (priority={priority})")
            
            return func
        
        if callback:
            return decorator(callback)
        else:
            return decorator
    
    def once(
        self, 
        event_type: str, 
        callback: Optional[Callable] = None,
        priority: int = EventPriority.NORMAL
    ):
        """注册一次性事件监听器
        
        触发一次后自动移除
        
        Args:
            event_type: 事件类型
            callback: 回调函数
            priority: 优先级
            
        Returns:
            装饰器函数或 None
        """
        def decorator(func: Callable) -> Callable:
            handler = EventHandler(
                callback=func,
                priority=priority,
                once=True
            )
            
            if event_type not in self.handlers:
                self.handlers[event_type] = []
            
            self.handlers[event_type].append(handler)
            self.handlers[event_type].sort(key=lambda h: h.priority)
            
            print(f"[EventDispatcher] Registered once handler for '{event_type}'")
            
            return func
        
        if callback:
            return decorator(callback)
        else:
            return decorator
    
    def on_any(self, callback: Callable, priority: int = EventPriority.LOW):
        """注册全局事件监听器
        
        接收所有事件
        
        Args:
            callback: 回调函数
            priority: 优先级
        """
        handler = EventHandler(
            callback=callback,
            priority=priority,
            once=False
        )
        
        self.global_handlers.append(handler)
        self.global_handlers.sort(key=lambda h: h.priority)
        
        print(f"[EventDispatcher] Registered global handler")
    
    def off(self, event_type: str, callback: Callable):
        """移除事件监听器
        
        Args:
            event_type: 事件类型
            callback: 回调函数
        """
        if event_type in self.handlers:
            # 查找并移除匹配的处理器
            self.handlers[event_type] = [
                h for h in self.handlers[event_type] 
                if h.callback != callback
            ]
            
            print(f"[EventDispatcher] Removed handler for '{event_type}'")
    
    def off_all(self, event_type: Optional[str] = None):
        """移除所有事件监听器
        
        Args:
            event_type: 事件类型，None 表示移除所有
        """
        if event_type:
            self.handlers.pop(event_type, None)
            print(f"[EventDispatcher] Removed all handlers for '{event_type}'")
        else:
            self.handlers.clear()
            self.global_handlers.clear()
            print("[EventDispatcher] Removed all handlers")
    
    async def emit(
        self, 
        event_type: str, 
        data: Any = None,
        source: Optional[str] = None
    ) -> Event:
        """触发事件
        
        Args:
            event_type: 事件类型
            data: 事件数据
            source: 事件源
            
        Returns:
            事件对象
        """
        # 创建事件对象
        event = Event(
            event_type=event_type,
            data=data,
            source=source
        )
        
        # 同步调用处理器
        await self._dispatch_event(event)
        
        return event
    
    async def emit_async(
        self, 
        event_type: str, 
        data: Any = None,
        source: Optional[str] = None
    ):
        """异步触发事件（放入队列）
        
        Args:
            event_type: 事件类型
            data: 事件数据
            source: 事件源
        """
        event = Event(
            event_type=event_type,
            data=data,
            source=source
        )
        
        await self.event_queue.put(event)
    
    async def _dispatch_event(self, event: Event):
        """分发事件到处理器
        
        Args:
            event: 事件对象
        """
        # 先调用全局处理器
        await self._call_handlers(event, self.global_handlers)
        
        # 如果事件已取消，停止传播
        if event.cancelled:
            return
        
        # 调用特定事件的处理器
        handlers = self.handlers.get(event.event_type, [])
        
        # 复制列表，因为可能在处理过程中修改
        handlers_to_remove = []
        
        for handler in handlers[:]:  # 遍历副本
            if event.cancelled:
                break
            
            if not handler.enabled:
                continue
            
            try:
                # 调用处理器
                await self._call_handler(handler, event)
                
                # 记录
                handler.call_count += 1
                handler.last_called = datetime.utcnow()
                
                # 如果是一次性处理器，标记移除
                if handler.once:
                    handlers_to_remove.append(handler)
                    
            except Exception as e:
                print(f"[EventDispatcher] Handler error for '{event.event_type}': {e}")
        
        # 移除一次性处理器
        for handler in handlers_to_remove:
            self.handlers[event.event_type].remove(handler)
            print(f"[EventDispatcher] Removed once handler for '{event.event_type}'")
    
    async def _call_handlers(self, event: Event, handlers: List[EventHandler]):
        """调用处理器列表
        
        Args:
            event: 事件对象
            handlers: 处理器列表
        """
        for handler in sorted(handlers, key=lambda h: h.priority):
            if event.cancelled:
                break
            
            if not handler.enabled:
                continue
            
            try:
                await self._call_handler(handler, event)
                
                handler.call_count += 1
                handler.last_called = datetime.utcnow()
                
                if handler.once:
                    handlers.remove(handler)
                    
            except Exception as e:
                print(f"[EventDispatcher] Handler error: {e}")
    
    async def _call_handler(self, handler: EventHandler, event: Event):
        """调用单个处理器
        
        Args:
            handler: 处理器
            event: 事件对象
        """
        callback = handler.callback
        
        # 判断是否是异步函数
        if asyncio.iscoroutinefunction(callback):
            await callback(event)
        else:
            # 同步函数在线程池中执行
            await asyncio.get_event_loop().run_in_executor(None, callback, event)
    
    async def start_async_processing(self):
        """启动异步事件处理循环"""
        if self._process_task and not self._process_task.done():
            print("[EventDispatcher] Async processing already running")
            return
        
        async def process_loop():
            while True:
                try:
                    event = await self.event_queue.get()
                    await self._dispatch_event(event)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[EventDispatcher] Processing error: {e}")
        
        self._process_task = asyncio.create_task(process_loop())
        print("[EventDispatcher] Started async processing")
    
    async def stop_async_processing(self):
        """停止异步事件处理循环"""
        if self._process_task and not self._process_task.done():
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass
            
            print("[EventDispatcher] Stopped async processing")
    
    def get_handlers(self, event_type: str) -> List[EventHandler]:
        """获取指定事件类型的处理器列表
        
        Args:
            event_type: 事件类型
            
        Returns:
            处理器列表
        """
        return self.handlers.get(event_type, [])
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息
        
        Returns:
            统计信息字典
        """
        stats = {
            "event_types": len(self.handlers),
            "total_handlers": sum(len(handlers) for handlers in self.handlers.values()),
            "global_handlers": len(self.global_handlers),
            "handlers_per_event": {
                event_type: len(handlers) 
                for event_type, handlers in self.handlers.items()
            }
        }
        
        return stats
    
    def enable_handler(self, event_type: str, callback: Callable):
        """启用处理器
        
        Args:
            event_type: 事件类型
            callback: 回调函数
        """
        handlers = self.handlers.get(event_type, [])
        for handler in handlers:
            if handler.callback == callback:
                handler.enabled = True
    
    def disable_handler(self, event_type: str, callback: Callable):
        """禁用处理器
        
        Args:
            event_type: 事件类型
            callback: 回调函数
        """
        handlers = self.handlers.get(event_type, [])
        for handler in handlers:
            if handler.callback == callback:
                handler.enabled = False