/**
 * Home-Agent 协调服务
 * 处理跨房间和复杂任务
 */

import config from '../config/agent.config'

export default class HomeAgentService {
  constructor(mqttService) {
    this.mqtt = mqttService
    this.messageCallbacks = new Map()

    console.log('[HomeAgentService] Initialized')
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
   * 发送任务到 Home-Agent
   * @param {Object} intent - 用户意图
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendTask(intent) {
    if (!this.mqtt.isConnected()) {
      console.error('[HomeAgentService] MQTT not connected')
      return false
    }

    const message = {
      message_id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      source_agent: `watch-${config.agent.userId}`,
      intent: {
        room: intent.room,
        device: intent.device,
        action: intent.action,
        parameters: intent.parameters
      }
    }

    const topic = 'home/tasks'
    const payload = JSON.stringify(message)

    console.log('[HomeAgentService] Sending task:', { topic, message })

    try {
      const success = await this.mqtt.publish(topic, payload)
      if (success) {
        console.log('[HomeAgentService] Task sent successfully')
      }
      return success
    } catch (err) {
      console.error('[HomeAgentService] Failed to send task:', err)
      return false
    }
  }

  /**
   * 订阅 Home-Agent 响应
   * @param {Function} callback - 响应回调
   * @returns {Promise<boolean>} 是否订阅成功
   */
  async subscribeToResponse(callback) {
    if (!this.mqtt.isConnected()) {
      console.error('[HomeAgentService] MQTT not connected')
      return false
    }

    const userId = config.agent.userId
    const topic = `home/agents/watch-${userId}/response`

    console.log('[HomeAgentService] Subscribing to response:', topic)

    try {
      const success = await this.mqtt.subscribe(topic, (payload) => {
        console.log('[HomeAgentService] Response received:', payload)
        try {
          const response = JSON.parse(payload)
          callback(response)
        } catch (err) {
          console.error('[HomeAgentService] Failed to parse response:', err)
        }
      })

      if (success) {
        this.messageCallbacks.set(topic, callback)
      }

      return success
    } catch (err) {
      console.error('[HomeAgentService] Failed to subscribe:', err)
      return false
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[HomeAgentService] Destroying...')

    // 取消所有订阅
    for (const [topic] of this.messageCallbacks) {
      this.mqtt.unsubscribe(topic)
    }

    this.messageCallbacks.clear()
  }
}
