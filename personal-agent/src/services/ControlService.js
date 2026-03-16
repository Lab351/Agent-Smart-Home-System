/**
 * 设备控制服务
 *
 * 负责向 Room Agent 发送控制命令
 * 使用 MQTT 进行通信
 */

import MqttService from './mqtt-service'
import config from '../config/agent.config'

export default class ControlService {
  constructor(mqttService = null) {
    this.mqtt = mqttService || new MqttService()
    this.roomAgents = new Map() // roomId -> agent info
    this.messageCallbacks = new Map()

    console.log('[ControlService] Initialized')
  }

  /**
   * 生成 UUID
   * @returns {string} UUID v4 格式字符串
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * 发送控制命令到 Room Agent
   * @param {string} roomId - 房间 ID
   * @param {string} target - 目标设备
   * @param {string} action - 动作
   * @param {Object} parameters - 参数
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendControl(roomId, target, action, parameters = {}) {
    if (!this.mqtt.isConnected()) {
      console.error('[ControlService] MQTT not connected')
      return false
    }

    // 获取 Room Agent ID
    const agentId = this.getAgentIdForRoom(roomId)
    if (!agentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    // 构建控制消息（格式符合 room-agent 的 ControlMessage 模型）
    const message = {
      message_id: this.generateUUID(),
      timestamp: new Date().toISOString(), // ISO 8601 格式
      source_agent: `watch-${config.agent.userId}`,
      target_device: target,
      action: action,
      parameters: parameters
    }

    const topic = `room/${roomId}/agent/${agentId}/control`
    const payload = JSON.stringify(message)

    console.log('[ControlService] Sending control:', { topic, message })

    try {
      const success = await this.mqtt.publish(topic, payload)
      if (success) {
        console.log('[ControlService] Control sent successfully')
      }
      return success
    } catch (err) {
      console.error('[ControlService] Failed to send control:', err)
      return false
    }
  }

  /**
   * 订阅 Room Agent 状态更新
   * @param {string} roomId - 房间 ID
   * @param {Function} callback - 状态更新回调
   * @returns {Promise<boolean>} 是否订阅成功
   */
  async subscribeToState(roomId, callback) {
    if (!this.mqtt.isConnected()) {
      console.error('[ControlService] MQTT not connected')
      return false
    }

    const agentId = this.getAgentIdForRoom(roomId)
    if (!agentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    const topic = `room/${roomId}/agent/${agentId}/state`

    console.log('[ControlService] Subscribing to state:', topic)

    try {
      const success = await this.mqtt.subscribe(topic, (payload) => {
        console.log('[ControlService] State update:', topic, payload)
        try {
          const state = JSON.parse(payload)
          callback(state)
        } catch (err) {
          console.error('[ControlService] Failed to parse state:', err)
        }
      })

      if (success) {
        this.messageCallbacks.set(topic, callback)
      }

      return success
    } catch (err) {
      console.error('[ControlService] Failed to subscribe:', err)
      return false
    }
  }

  /**
   * 查询房间 Agent 能力
   * @param {string} roomId - 房间 ID
   * @returns {Promise<boolean>} 是否发送成功
   */
  async queryCapabilities(roomId) {
    if (!this.mqtt.isConnected()) {
      console.error('[ControlService] MQTT not connected')
      return false
    }

    const agentId = this.getAgentIdForRoom(roomId)
    if (!agentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    const message = {
      message_id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      source_agent: `watch-${config.agent.userId}`,
      query_type: 'capabilities'
    }

    const topic = `room/${roomId}/agent/${agentId}/describe`
    const payload = JSON.stringify(message)

    console.log('[ControlService] Querying capabilities:', { topic, message })

    try {
      const success = await this.mqtt.publish(topic, payload)
      if (success) {
        console.log('[ControlService] Capabilities query sent successfully')
      }
      return success
    } catch (err) {
      console.error('[ControlService] Failed to query capabilities:', err)
      return false
    }
  }

  /**
   * 订阅能力描述响应
   * @param {string} roomId - 房间 ID
   * @param {Function} callback - 回调函数
   * @returns {Promise<boolean>} 是否订阅成功
   */
  async subscribeToDescription(roomId, callback) {
    if (!this.mqtt.isConnected()) {
      console.error('[ControlService] MQTT not connected')
      return false
    }

    const agentId = this.getAgentIdForRoom(roomId)
    if (!agentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    const topic = `room/${roomId}/agent/${agentId}/description`

    console.log('[ControlService] Subscribing to description:', topic)

    try {
      const success = await this.mqtt.subscribe(topic, (payload) => {
        console.log('[ControlService] Description received:', payload)
        try {
          const description = JSON.parse(payload)
          callback(description)
        } catch (err) {
          console.error('[ControlService] Failed to parse description:', err)
        }
      })

      if (success) {
        this.messageCallbacks.set(topic, callback)
      }

      return success
    } catch (err) {
      console.error('[ControlService] Failed to subscribe to description:', err)
      return false
    }
  }

  /**
   * 设置 Room Agent 映射
   * @param {string} roomId - 房间 ID
   * @param {string} agentId - Agent ID
   */
  setRoomAgent(roomId, agentId) {
    console.log('[ControlService] Set room agent:', roomId, '->', agentId)
    this.roomAgents.set(roomId, agentId)
  }

  /**
   * 获取房间的 Agent ID
   * @param {string} roomId - 房间 ID
   * @returns {string|null} Agent ID
   */
  getAgentIdForRoom(roomId) {
    // 默认使用房间 ID 作为 Agent ID
    return this.roomAgents.get(roomId) || roomId
  }

  /**
   * 检查是否已连接到 MQTT
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.mqtt.isConnected()
  }

  /**
   * 获取 MQTT 服务实例
   * @returns {MqttService} MQTT 服务实例
   */
  getMqttService() {
    return this.mqtt
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[ControlService] Destroying...')

    // 取消所有订阅
    for (const [topic] of this.messageCallbacks) {
      this.mqtt.unsubscribe(topic)
    }

    this.messageCallbacks.clear()
    this.roomAgents.clear()
  }
}
