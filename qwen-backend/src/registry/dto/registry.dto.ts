import { IsString, IsEnum, IsArray, IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Agent类型枚举
 */
export enum AgentType {
  ROOM = 'room',
  PERSONAL = 'personal',
  CENTRAL = 'central',
}

/**
 * 设备能力DTO
 */
export class DeviceCapabilityDto {
  @ApiProperty({ description: '设备ID', example: 'light_1' })
  @IsString()
  id: string;

  @ApiProperty({ description: '设备名称', example: '主灯' })
  @IsString()
  name: string;

  @ApiProperty({ description: '设备类型', example: 'light' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: '支持的动作列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actions?: string[];

  @ApiPropertyOptional({ description: '状态属性列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  state_attributes?: string[];
}

/**
 * Agent技能DTO
 */
export class AgentSkillDto {
  @ApiProperty({ description: '技能ID', example: 'adjust_lighting' })
  @IsString()
  id: string;

  @ApiProperty({ description: '技能名称', example: '调节照明' })
  @IsString()
  name: string;

  @ApiProperty({ description: '技能描述', example: '根据场景自动调节灯光' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: '技能标签', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: '使用示例', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  examples?: string[];
}

/**
 * 通信配置DTO
 */
export class CommunicationConfigDto {
  @ApiProperty({ description: '通信后端', enum: ['mqtt', 'a2a_sdk'], example: 'mqtt' })
  @IsString()
  backend: string;

  @ApiPropertyOptional({ description: 'MQTT配置' })
  @IsObject()
  @IsOptional()
  mqtt?: Record<string, any>;

  @ApiPropertyOptional({ description: 'A2A SDK配置' })
  @IsObject()
  @IsOptional()
  a2a_sdk?: Record<string, any>;
}

/**
 * Agent Card DTO
 * 
 * 符合A2A Protocol规范的Agent描述
 */
export class AgentCardDto {
  @ApiProperty({ description: 'Agent唯一标识', example: 'room-agent-bedroom-01' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Agent名称', example: '卧室房间代理' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Agent描述', example: '管理卧室智能设备的Agent' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Agent版本', example: '1.0.0' })
  @IsString()
  @IsOptional()
  version?: string;

  @ApiProperty({ description: 'Agent类型', enum: AgentType })
  @IsEnum(AgentType)
  agent_type: AgentType;

  @ApiPropertyOptional({ description: 'Agent能力列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  capabilities?: string[];

  @ApiPropertyOptional({ description: 'Agent技能列表', type: [AgentSkillDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentSkillDto)
  @IsOptional()
  skills?: AgentSkillDto[];

  @ApiPropertyOptional({ description: '设备能力列表', type: [DeviceCapabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceCapabilityDto)
  @IsOptional()
  devices?: DeviceCapabilityDto[];

  @ApiPropertyOptional({ description: '通信配置' })
  @ValidateNested()
  @Type(() => CommunicationConfigDto)
  @IsOptional()
  communication?: CommunicationConfigDto;

  @ApiPropertyOptional({ description: 'Agent服务URL' })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({ description: '文档URL' })
  @IsString()
  @IsOptional()
  documentation_url?: string;

  @ApiPropertyOptional({ description: '认证配置' })
  @IsObject()
  @IsOptional()
  authentication?: Record<string, any>;

  @ApiPropertyOptional({ description: '额外元数据' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Agent注册信息（包含时间戳）
 */
export class AgentRegistrationDto extends AgentCardDto {
  @ApiProperty({ description: '注册时间' })
  @IsString()
  registered_at: string;

  @ApiProperty({ description: '最后心跳时间' })
  @IsString()
  last_heartbeat: string;
}

/**
 * 查询Agent的DTO
 */
export class DiscoverAgentDto {
  @ApiPropertyOptional({ description: 'Agent ID' })
  @IsString()
  @IsOptional()
  agent_id?: string;

  @ApiPropertyOptional({ description: 'Agent类型', enum: AgentType })
  @IsEnum(AgentType)
  @IsOptional()
  agent_type?: AgentType;

  @ApiPropertyOptional({ description: '能力过滤' })
  @IsString()
  @IsOptional()
  capability?: string;
}