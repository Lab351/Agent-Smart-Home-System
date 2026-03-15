/**
 * A2A 消息工具类
 * 
 * 用于生成和解析标准化的 MQTT 消息
 */

/**
 * 生成 UUID v4
 * @returns {string} UUID
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 获取当前 ISO 8601 时间戳
 * @returns {string} ISO 时间戳
 */
export function getTimestamp() {
  return new Date().toISOString()
}

/**
 * 消息基类
 */
export class BaseMessage {
  constructor(sourceAgent) {
    this.messageId = generateUUID()
    this.timestamp = getTimestamp()
    this.sourceAgent = sourceAgent
    this.version = '1.0.0'
  }

  toJSON() {
    return {
      message_id: this.messageId,
      timestamp: this.timestamp,
      source_agent: this.sourceAgent,
      version: this.version,
    }
  }
}

/**
 * 控制消息
 * 
 * Topic: room/{room_id}/agent/{agent_id}/control
 * QoS: 1
 */
export class ControlMessage extends BaseMessage {
  /**
   * @param {string} sourceAgent - 发送方 Agent ID
   * @param {string} targetDevice - 目标设备 ID
   * @param {string} action - 要执行的动作
   * @param {Object} [parameters] - 动作参数
   * @param {string} [correlationId] - 关联 ID
   */
  constructor(sourceAgent, targetDevice, action, parameters = {}, correlationId = null) {
    super(sourceAgent)
    this.targetDevice = targetDevice
    this.action = action
    this.parameters = parameters
    this.correlationId = correlationId
  }

  toJSON() {
    const base = super.toJSON()
    return {
      ...base,
      target_device: this.targetDevice,
      action: this.action,
      parameters: this.parameters,
      correlation_id: this.correlationId,
    }
  }
}

/**
 * 能力查询消息
 * 
 * Topic: room/{room_id}/agent/{agent_id}/describe
 * QoS: 1
 */
export class DescribeMessage extends BaseMessage {
  /**
   * @param {string} sourceAgent - 查询方 Agent ID
   * @param {string} [queryType] - 查询类型
   */
  constructor(sourceAgent, queryType = 'capabilities') {
    super(sourceAgent)
    this.queryType = queryType
  }

  toJSON() {
    const base = super.toJSON()
    return {
      ...base,
      query_type: this.queryType,
    }
  }
}

/**
 * 仲裁请求消息
 * 
 * Topic: home/arbitration
 * QoS: 1
 */
export class ArbitrationRequestMessage extends BaseMessage {
  /**
   * @param {string} sourceAgent - 请求仲裁的 Agent ID
   * @param {string} conflictType - 冲突类型
   * @param {Object} intent - 用户意图
   * @param {Object} [context] - 上下文信息
   * @param {string[]} [conflictingAgents] - 冲突的 Agent 列表
   */
  constructor(sourceAgent, conflictType, intent, context = {}, conflictingAgents = []) {
    super(sourceAgent)
    this.conflictType = conflictType
    this.intent = intent
    this.context = context
    this.conflictingAgents = conflictingAgents
  }

  toJSON() {
    const base = super.toJSON()
    return {
      ...base,
      requesting_agent: this.sourceAgent,
      conflicting_agents: this.conflictingAgents,
      conflict_type: this.conflictType,
      intent: this.intent,
      context: this.context,
    }
  }
}

/**
 * 消息解析器
 */
export class MessageParser {
  /**
   * 解析 JSON 消息
   * @param {string} payload - JSON 字符串
   * @returns {Object} 解析后的消息对象
   */
  static parse(payload) {
    try {
      const data = JSON.parse(payload)
      return {
        messageId: data.message_id,
        timestamp: data.timestamp,
        sourceAgent: data.source_agent,
        version: data.version,
        ...data,
      }
    } catch (e) {
      console.error('[MessageParser] Failed to parse message:', e)
      return null
    }
  }

  /**
   * 解析状态消息
   * @param {string} payload - JSON 字符串
   * @returns {Object|null} 状态消息对象
   */
  static parseStateMessage(payload) {
    const data = this.parse(payload)
    if (!data) return null

    return {
      ...data,
      agentId: data.agent_id,
      agentStatus: data.agent_status,
      devices: data.devices || [],
      roomState: data.room_state || null,
    }
  }

  /**
   * 解析能力描述消息
   * @param {string} payload - JSON 字符串
   * @returns {Object|null} 能力描述对象
   */
  static parseDescriptionMessage(payload) {
    const data = this.parse(payload)
    if (!data) return null

    return {
      ...data,
      agentId: data.agent_id,
      agentType: data.agent_type,
      devices: data.devices || [],
      capabilities: data.capabilities || [],
      roomCapability: data.room_capability || null,
    }
  }

  /**
   * 解析全局状态消息
   * @param {string} payload - JSON 字符串
   * @returns {Object|null} 全局状态对象
   */
  static parseGlobalStateMessage(payload) {
    const data = this.parse(payload)
    if (!data) return null

    return {
      ...data,
      homeMode: data.home_mode,
      activeUsers: data.active_users || [],
      riskLevel: data.risk_level,
      temporalContext: data.temporal_context || null,
    }
  }

  /**
   * 解析仲裁响应消息
   * @param {string} payload - JSON 字符串
   * @returns {Object|null} 仲裁响应对象
   */
  static parseArbitrationResponse(payload) {
    const data = this.parse(payload)
    if (!data) return null

    return {
      ...data,
      requestId: data.request_id,
      decision: data.decision,
      reason: data.reason,
      suggestion: data.suggestion,
      modifiedAction: data.modified_action,
    }
  }
}