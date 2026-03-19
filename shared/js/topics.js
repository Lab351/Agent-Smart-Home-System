/**
 * A2A Topic 命名空间工具类
 * 
 * 根据 docs/communication.md 规范定义 Topic 命名空间
 */

export class TopicBuilder {
  /**
   * 控制命令 Topic
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string} Topic: room/{room_id}/agent/{agent_id}/control
   */
  static control(roomId, agentId) {
    return `room/${roomId}/agent/${agentId}/control`
  }

  /**
   * 状态发布 Topic
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string} Topic: room/{room_id}/agent/{agent_id}/state
   */
  static state(roomId, agentId) {
    return `room/${roomId}/agent/${agentId}/state`
  }

  /**
   * 能力查询 Topic
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string} Topic: room/{room_id}/agent/{agent_id}/describe
   */
  static describe(roomId, agentId) {
    return `room/${roomId}/agent/${agentId}/describe`
  }

  /**
   * 能力响应 Topic
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string} Topic: room/{room_id}/agent/{agent_id}/description
   */
  static description(roomId, agentId) {
    return `room/${roomId}/agent/${agentId}/description`
  }

  /**
   * 心跳 Topic
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string} Topic: room/{room_id}/agent/{agent_id}/heartbeat
   */
  static heartbeat(roomId, agentId) {
    return `room/${roomId}/agent/${agentId}/heartbeat`
  }

  /**
   * 全局状态 Topic
   * @returns {string} Topic: home/state
   */
  static globalState() {
    return 'home/state'
  }

  /**
   * 策略更新 Topic
   * @returns {string} Topic: home/policy
   */
  static policy() {
    return 'home/policy'
  }

  /**
   * 仲裁 Topic
   * @param {string} [requestId] - 请求 ID（可选，用于响应）
   * @returns {string} Topic
   */
  static arbitration(requestId = null) {
    if (requestId) {
      return `home/arbitration/response/${requestId}`
    }
    return 'home/arbitration'
  }

  /**
   * 系统事件 Topic
   * @returns {string} Topic: home/events
   */
  static events() {
    return 'home/events'
  }
}

/**
 * Topic 解析器
 */
export class TopicParser {
  /**
   * 解析 Topic
   * @param {string} topic - MQTT Topic
   * @returns {Object} 解析结果
   */
  static parse(topic) {
    const parts = topic.split('/')
    const result = {}

    if (parts[0] === 'room' && parts.length >= 2) {
      result.type = 'room'
      result.roomId = parts[1]

      if (parts.length >= 4 && parts[2] === 'agent') {
        result.agentId = parts[3]
      }

      if (parts.length >= 5) {
        result.messageType = parts[4]
      }
    } else if (parts[0] === 'home') {
      result.type = 'home'

      if (parts.length >= 2) {
        result.messageType = parts[1]
      }

      if (parts.length >= 3 && parts[1] === 'arbitration' && parts[2] === 'response') {
        result.isResponse = true
        if (parts.length >= 4) {
          result.requestId = parts[3]
        }
      }
    }

    return result
  }
}

/**
 * QoS 配置
 */
export class QoSConfig {
  static QOS_MAP = {
    'control': 1,
    'state': 0,
    'describe': 1,
    'description': 1,
    'heartbeat': 0,
    'home/state': 0,
    'home/policy': 1,
    'home/arbitration': 1,
    'home/arbitration/response': 1,
    'home/events': 1,
  }

  /**
   * 获取消息类型的 QoS 等级
   * @param {string} messageType - 消息类型
   * @returns {number} QoS 等级
   */
  static getQos(messageType) {
    return this.QOS_MAP[messageType] || 0
  }

  /**
   * 根据 Topic 获取 QoS 等级
   * @param {string} topic - MQTT Topic
   * @returns {number} QoS 等级
   */
  static getQosForTopic(topic) {
    const parsed = TopicParser.parse(topic)

    if (parsed.type === 'home') {
      const messageType = `home/${parsed.messageType || ''}`
      return this.QOS_MAP[messageType] || 0
    }

    return this.QOS_MAP[parsed.messageType] || 0
  }
}

/**
 * 订阅 Topic 模式
 */
export class SubscriptionTopics {
  /**
   * Personal Agent 订阅的 Topics
   * @param {string} roomId - 房间 ID
   * @returns {string[]} Topic 列表
   */
  static personalAgent(roomId) {
    return [
      `room/${roomId}/agent/+/state`,
      `room/${roomId}/agent/+/description`,
      'home/state',
      'home/policy',
      'home/arbitration/response/+',
    ]
  }

  /**
   * Room Agent 订阅的 Topics
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   * @returns {string[]} Topic 列表
   */
  static roomAgent(roomId, agentId) {
    return [
      `room/${roomId}/agent/${agentId}/control`,
      `room/${roomId}/agent/${agentId}/describe`,
      'home/policy',
    ]
  }

  /**
   * Central Agent 订阅的 Topics
   * @returns {string[]} Topic 列表
   */
  static centralAgent() {
    return [
      'room/+/agent/+/state',
      'room/+/agent/+/heartbeat',
      'home/arbitration',
    ]
  }
}
