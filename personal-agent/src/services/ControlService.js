/**
 * 设备控制服务
 *
 * 负责将控制、能力查询委派给具体 transport。
 */

import MqttControlTransport from './transports/MqttControlTransport.js'

export default class ControlService {
  constructor(mqttService = null, options = {}) {
    this.mqtt = mqttService
    this.roomAgents = new Map()
    this.personalAgentId = options.personalAgentId || 'personal-agent'
    this.transport = mqttService ? new MqttControlTransport(mqttService) : null

    console.log('[ControlService] Initialized')
  }

  /**
   * 切换当前 transport
   */
  setTransport(transport) {
    if (this.transport && this.transport !== transport) {
      if (typeof this.transport.destroy === 'function') {
        this.transport.destroy()
      } else {
        this.transport.disconnect()
      }
    }
    this.transport = transport
  }

  /**
   * 获取当前 transport
   */
  getTransport() {
    return this.transport
  }

  /**
   * 发送控制命令到 Room Agent
   */
  async sendControl(roomId, target, action, parameters = {}) {
    if (!this.transport || !this.transport.isConnected()) {
      console.error('[ControlService] Transport not connected')
      return false
    }

    const roomAgentId = this.getAgentIdForRoom(roomId)
    if (!roomAgentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    return this.transport.sendControl({
      roomId,
      roomAgentId,
      targetDevice: target,
      action,
      parameters,
      sourceAgent: this.personalAgentId,
    })
  }

  /**
   * 订阅 Room Agent 状态更新
   */
  async subscribeToState(roomId, callback) {
    if (!this.transport) {
      return false
    }

    return this.transport.subscribeToState(
      roomId,
      callback,
      { roomAgentId: this.getAgentIdForRoom(roomId) }
    )
  }

  /**
   * 查询房间 Agent 能力
   */
  async queryCapabilities(roomId, agentInfo = null) {
    if (!this.transport || !this.transport.isConnected()) {
      console.error('[ControlService] Transport not connected')
      return false
    }

    const roomAgentId = this.getAgentIdForRoom(roomId)
    if (!roomAgentId) {
      console.error('[ControlService] No agent found for room:', roomId)
      return false
    }

    return this.transport.queryCapabilities({
      roomId,
      roomAgentId,
      agentInfo,
      sourceAgent: this.personalAgentId,
    })
  }

  /**
   * 订阅能力描述响应
   */
  async subscribeToDescription(roomId, callback) {
    if (!this.transport) {
      return false
    }

    return this.transport.subscribeToDescription(
      roomId,
      callback,
      { roomAgentId: this.getAgentIdForRoom(roomId) }
    )
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
    return this.roomAgents.get(roomId) || roomId
  }

  /**
   * 检查当前 transport 是否已连接
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return !!this.transport && this.transport.isConnected()
  }

  /**
   * 获取 MQTT 服务实例
   * @returns {Object|null} MQTT 服务实例
   */
  getMqttService() {
    return this.mqtt
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[ControlService] Destroying...')

    if (this.transport) {
      if (typeof this.transport.destroy === 'function') {
        this.transport.destroy()
      } else {
        this.transport.disconnect()
      }
    }

    this.roomAgents.clear()
  }
}
