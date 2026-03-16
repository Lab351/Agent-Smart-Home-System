from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
from enum import Enum


class AgentType(str, Enum):
    """Agent类型枚举"""
    ROOM = "room"
    PERSONAL = "personal"
    CENTRAL = "central"


class DeviceCapability(BaseModel):
    """设备能力描述（统一格式，兼容A2A标准）"""
    
    model_config = ConfigDict(str_max_length=100)
    
    id: str = Field(..., description="设备ID")
    name: str = Field(..., description="设备名称")
    type: str = Field(..., description="设备类型: light/curtain/climate/sensor")
    actions: List[str] = Field(default_factory=list, description="支持的动作列表")
    state_attributes: List[str] = Field(default_factory=list, description="状态属性列表")
    
    input_schema: Optional[Dict[str, Any]] = Field(None, description="输入参数JSON Schema（A2A扩展）")
    output_schema: Optional[Dict[str, Any]] = Field(None, description="输出参数JSON Schema（A2A扩展）")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "light_1",
                "name": "主灯",
                "type": "light",
                "actions": ["on", "off", "set_brightness", "set_color_temp"],
                "state_attributes": ["brightness", "color_temp", "power_state"],
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "brightness": {"type": "integer", "minimum": 0, "maximum": 100},
                        "color_temp": {"type": "integer", "minimum": 2700, "maximum": 6500}
                    }
                }
            }
        }
    )


class AgentSkill(BaseModel):
    """Agent技能（A2A标准）"""
    
    id: str = Field(..., description="技能ID")
    name: str = Field(..., description="技能名称")
    description: str = Field(..., description="技能描述")
    tags: List[str] = Field(default_factory=list, description="技能标签")
    examples: List[str] = Field(default_factory=list, description="使用示例")
    
    input_modes: List[str] = Field(default=["text"], description="支持的输入模式")
    output_modes: List[str] = Field(default=["text"], description="支持的输出模式")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "adjust_lighting",
                "name": "调节照明",
                "description": "根据场景自动调节灯光亮度和色温",
                "tags": ["light", "automation"],
                "examples": ["调暗灯光", "打开阅读模式"],
                "input_modes": ["text"],
                "output_modes": ["text"]
            }
        }
    )


class CommunicationConfig(BaseModel):
    """通信配置"""
    backend: str = Field(default="mqtt", description="通信后端: mqtt | a2a_sdk")
    mqtt: Optional[Dict[str, Any]] = Field(None, description="MQTT配置")
    a2a_sdk: Optional[Dict[str, Any]] = Field(None, description="A2A SDK配置")


class AgentCard(BaseModel):
    """Agent Card（A2A标准格式）
    
    这是Agent的唯一标识和能力描述，用于服务发现和Agent间协作
    符合A2A Protocol规范
    """
    
    id: str = Field(..., description="Agent唯一标识")
    name: str = Field(..., description="Agent名称")
    description: str = Field(..., description="Agent描述")
    version: str = Field(default="1.0.0", description="Agent版本")
    
    agent_type: AgentType = Field(..., description="Agent类型")
    
    capabilities: List[str] = Field(default_factory=list, description="Agent能力列表")
    skills: List[AgentSkill] = Field(default_factory=list, description="Agent技能列表")
    devices: List[DeviceCapability] = Field(default_factory=list, description="设备能力列表")
    
    communication: Optional[CommunicationConfig] = Field(None, description="通信配置")
    
    url: Optional[str] = Field(None, description="Agent服务URL（A2A SDK使用）")
    documentation_url: Optional[str] = Field(None, description="文档URL")
    
    authentication: Optional[Dict[str, Any]] = Field(None, description="认证配置")
    
    metadata: Dict[str, Any] = Field(default_factory=dict, description="额外元数据")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "room-agent-bedroom-01",
                "name": "卧室房间代理",
                "description": "管理卧室智能设备的Agent",
                "version": "1.0.0",
                "agent_type": "room",
                "capabilities": ["light_control", "curtain_control", "climate_control"],
                "skills": [
                    {
                        "id": "adjust_lighting",
                        "name": "调节照明",
                        "description": "根据场景自动调节灯光亮度和色温",
                        "tags": ["light", "automation"],
                        "examples": ["调暗灯光", "打开阅读模式"],
                        "input_modes": ["text"],
                        "output_modes": ["text"]
                    }
                ],
                "devices": [
                    {
                        "id": "light_1",
                        "name": "主灯",
                        "type": "light",
                        "actions": ["on", "off", "set_brightness", "set_color_temp"],
                        "state_attributes": ["brightness", "color_temp", "power_state"]
                    }
                ],
                "communication": {
                    "backend": "mqtt",
                    "mqtt": {
                        "broker": "192.168.1.100:1883",
                        "topics": ["room/bedroom_01/agent/room-agent-bedroom-01/control"]
                    },
                    "a2a_sdk": {
                        "url": "http://192.168.1.100:8001"
                    }
                },
                "url": "http://192.168.1.100:8001",
                "metadata": {
                    "room_id": "bedroom_01",
                    "location": "bedroom"
                }
            }
        }
    )