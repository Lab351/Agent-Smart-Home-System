/**
 * Personal Agent A2A 通信服务
 * 
 * 封装 Personal Agent 与 Room Agent 和 Central Agent 的通信逻辑
 */

import MqttService from './mqtt-service.js'
import { TopicBuilder, TopicParser, QoSConfig, SubscriptionTopics } from '../../shared/js/topics.js'
import { 
  ControlMessage, 
  DescribeMessage, 
  ArbitrationRequestMessage,
  MessageParser 
} from '../../shared/js/messages.js'

export default class A2ACommunicationService {
  constructor() {
    this.mqttService = new MqttService()
    this.agentId = null
    this.roomId = null
    this.roomAgentId = null
    this.connected = false
    
    this.stateCallbacks = []
    this.descriptionCallbacks = []
    this.globalStateCallbacks = []
    this.arbitrationCallbacks = []
    
    console.log('[A2ACommunicationService] Initialized')
  }

  /**
   * 连接到 Room Agent
   * @param {Object} options - 连接选项
   * @param {string} options.host - Broker 地址
   * @param {number} options.port - Broker 端口
   * @param {string} options.roomId - 房间 ID
   * @param {string} options.agentId - Agent ID
   * @param {string} [options.roomAgentId] - Room Agent ID
   * @returns {Promise<boolean>} 是否连接成功
   */
  async connect(options) {
    console.log('[A2ACommunicationService] Connecting to Room Agent:', options)

    this.agentId = options.agentId || `personal-agent-${Date.now()}`
    this.roomId = options.roomId
    this.roomAgentId = options.roomAgentId || `room-agent-${options.roomId}`

    const mqttOptions = {
      host: options.host,
      port: options.port,
      clientId: this.agentId,
    }

    const success = await this.mqttService.connect(mqttOptions)
    
    if (success) {
      this.connected = true
      await this._setupSubscriptions()
      console.log('[A2ACommunicationService] Connected successfully')
    }

    return success
  }

  /**
   * 设置订阅
   */
  async _setupSubscriptions() {
    const topics = SubscriptionTopics.personalAgent(this.roomId)
    
    for (const topic of topics) {
      await this.mqttService.subscribe(topic, this._handleMessage.bind(this))
    }

    console.log('[A2ACommunicationService] Subscribed to topics:', topics)
  }

  /**
   * 处理接收到的消息
   * @param {string} payload - 消息内容
   */
  _handleMessage(payload) {
    try {
      const parsed = TopicParser.parse(payload)
      const message = MessageParser.parse(payload)

      if (!message) return

      const parsedTopic = TopicParser.parse(this._extractTopicFromPayload(payload))

      if (parsedTopic.messageType === 'state') {
        const stateMessage = MessageParser.parseStateMessage(payload)
        this.stateCallbacks.forEach(cb => cb(stateMessage))
      } else if (parsedTopic.messageType === 'description') {
        const descMessage = MessageParser.parseDescriptionMessage(payload)
        this.descriptionCallbacks.forEach(cb => cb(descMessage))
      } else if (parsedTopic.messageType === 'state' && parsedTopic.type === 'home') {
        const globalState = MessageParser.parseGlobalStateMessage(payload)
        this.globalStateCallbacks.forEach(cb => cb(globalState))
      } else if (parsedTopic.isResponse && parsedTopic.messageType === 'arbitration') {
        const arbitrationResponse = MessageParser.parseArbitrationResponse(payload)
        this.arbitrationCallbacks.forEach(cb => cb(arbitrationResponse))
      }

    } catch (e) {
      console.error('[A2ACommunicationService] Failed to handle message:', e)
    }
  }

  /**
   * 发送控制命令
   * @param {string} targetDevice - 目标设备 ID
   * @param {string} action - 动作
   * @param {Object} [parameters] - 参数
   * @param {string} [correlationId] - 关联 ID
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendControl(targetDevice, action, parameters = {}, correlationId = null) {
    if (!this.connected) {
      console.error('[A2ACommunicationService] Not connected')
      return false
    }

    const message = new ControlMessage(
      this.agentId,
      targetDevice,
      action,
      parameters,
      correlationId
    )

    const topic = TopicBuilder.control(this.roomId, this.roomAgentId)
    const payload = JSON.stringify(message.toJSON())

    console.log('[A2ACommunicationService] Sending control:', topic, payload)
    return await this.mqttService.publish(topic, payload)
  }

  /**
   * 查询房间能力
   * @returns {Promise<boolean>} 是否发送成功
   */
  async queryCapabilities() {
    if (!this.connected) {
      console.error('[A2ACommunicationService] Not connected')
      return false
    }

    const message = new DescribeMessage(this.agentId, 'capabilities')
    const topic = TopicBuilder.describe(this.roomId, this.roomAgentId)
    const payload = JSON.stringify(message.toJSON())

    console.log('[A2ACommunicationService] Querying capabilities:', topic)
    return await this.mqttService.publish(topic, payload)
  }

  /**
   * 请求仲裁
   * @param {string} conflictType - 冲突类型
   * @param {Object} intent - 用户意图
   * @param {Object} [context] - 上下文
   * @param {string[]} [conflictingAgents] - 冲突的 Agent 列表
   * @returns {Promise<boolean>} 是否发送成功
   */
  async requestArbitration(conflictType, intent, context = {}, conflictingAgents = []) {
    if (!this.connected) {
      console.error('[A2ACommunicationService] Not connected')
      return false
    }

    const message = new ArbitrationRequestMessage(
      this.agentId,
      conflictType,
      intent,
      context,
      conflictingAgents
    )

    const topic = TopicBuilder.arbitration()
    const payload = JSON.stringify(message.toJSON())

    console.log('[A2ACommunicationService] Requesting arbitration:', topic)
    return await this.mqttService.publish(topic, payload)
  }

  /**
   * 订阅房间状态更新
   * @param {Function} callback - 回调函数
   */
  onStateUpdate(callback) {
    this.stateCallbacks.push(callback)
  }

  /**
   * 订阅能力描述更新
   * @param {Function} callback - 回调函数
   */
  onDescriptionUpdate(callback) {
    this.descriptionCallbacks.push(callback)
  }

  /**
   * 订阅全局状态更新
   * @param {Function} callback - 回调函数
   */
  onGlobalStateUpdate(callback) {
    this.globalStateCallbacks.push(callback)
  }

  /**
   * 订阅仲裁响应
   * @param {Function} callback - 回调函数
   */
  onArbitrationResponse(callback) {
    this.arbitrationCallbacks.push(callback)
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('[A2ACommunicationService] Disconnecting...')
    
    this.mqttService.disconnect()
    this.connected = false
    this.stateCallbacks = []
    this.descriptionCallbacks = []
    this.globalStateCallbacks = []
    this.arbitrationCallbacks = []
    
    console.log('[A2ACommunicationService] Disconnected')
  }

  /**
   * 检查连接状态
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.connected && this.mqttService.isConnected()
  }

  /**
   * 获取当前房间 ID
   * @returns {string|null} 房间 ID
   */
  getRoomId() {
    return this.roomId
  }

  /**
   * 获取当前 Agent ID
   * @returns {string|null} Agent ID
   */
  getAgentId() {
    return this.agentId
  }
}