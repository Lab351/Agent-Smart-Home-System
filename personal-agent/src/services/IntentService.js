/**
 * 意图解析服务
 * 
 * 通过后端 LLM API 解析用户意图
 * 包含本地关键词匹配作为 fallback
 */

import $ajax from '../helper/ajax'
import config from '../config/agent.config'

export default class IntentService {
  constructor() {
    this.backendUrl = config.backend?.url || 'http://120.78.228.69:3088'
    this.timeout = 5000

    this.deviceAliases = {
      '灯': 'light',
      '吊灯': 'ceiling_light',
      '顶灯': 'ceiling_light',
      '主灯': 'main_light',
      '台灯': 'desk_light',
      '床头灯': 'bedside_light',
      '音乐': 'speaker',
      '音响': 'speaker',
      '空调': 'ac',
      '冷气': 'ac',
      '风扇': 'fan',
      '窗帘': 'curtain',
      '电视': 'tv',
      '电视机': 'tv'
    }

    this.actionPatterns = {
      '打开': 'turn_on',
      '开启': 'turn_on',
      '开': 'turn_on',
      '关闭': 'turn_off',
      '关掉': 'turn_off',
      '关': 'turn_off',
      '调高': 'brightness_up',
      '调低': 'brightness_down',
      '最亮': 'brightness_max',
      '最暗': 'brightness_min',
      '暖色': 'color_warm',
      '冷色': 'color_cool',
      '播放': 'play',
      '暂停': 'pause',
      '停止': 'stop',
      '制热': 'mode_heat',
      '制冷': 'mode_cool',
      '除湿': 'mode_dry',
      '打开窗帘': 'curtain_open',
      '关闭窗帘': 'curtain_close',
      '拉开窗帘': 'curtain_open',
      '拉上窗帘': 'curtain_close'
    }

    this.roomMapping = {
      '客厅': 'livingroom',
      '卧室': 'bedroom',
      '书房': 'study',
      '厨房': 'kitchen',
      '浴室': 'bathroom',
      '卫生间': 'bathroom'
    }

    console.log('[IntentService] Initialized with backend:', this.backendUrl)
  }

  /**
   * 解析语音文本，提取意图
   * @param {string} text - 语音文本
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 解析结果
   */
  async parse(text, context = {}) {
    console.log('[IntentService] Parsing:', text, 'with context:', context)

    try {
      const result = await this.parseWithLLM(text, context)
      if (result && result.intent) {
        console.log('[IntentService] LLM parse success:', result)
        return {
          text: text.trim(),
          device: result.intent.device,
          action: result.intent.action,
          parameters: result.intent.parameters || {},
          room: result.routing?.room_id || context.current_room || null,
          confidence: result.intent.confidence || 0.8,
          routing: result.routing,
          source: 'llm'
        }
      }
    } catch (err) {
      console.warn('[IntentService] LLM parse failed, using fallback:', err.message)
    }

    const fallbackResult = this.parseLocal(text)
    console.log('[IntentService] Fallback parse result:', fallbackResult)
    return {
      ...fallbackResult,
      source: 'fallback'
    }
  }

  /**
   * 通过后端 LLM API 解析意图
   * @param {string} text - 用户输入
   * @param {Object} context - 上下文
   * @returns {Promise<Object|null>} 解析结果
   */
  async parseWithLLM(text, context) {
    const requestBody = {
      text: text.trim(),
      context: {
        current_room: context.current_room || null,
        current_beacon_id: context.current_beacon_id || null,
        available_devices: context.available_devices || [],
        conversation_history: this.limitConversationHistory(context.conversation_history || [])
      }
    }

    console.log('[IntentService] Sending to LLM:', JSON.stringify(requestBody))

    const data = await $ajax.post(`${this.backendUrl}/api/intent/parse`, requestBody)

    if (!data || !data.success || !data.data) {
      throw new Error(data?.message || 'Invalid response')
    }

    return data.data
  }

  /**
   * 限制对话历史长度（保留最近 3 轮）
   * @param {Array} history - 对话历史
   * @returns {Array} 限制后的历史
   */
  limitConversationHistory(history) {
    if (!history || history.length <= 6) {
      return history
    }
    return history.slice(-6)
  }

  /**
   * 本地关键词匹配解析
   * @param {string} text - 用户输入
   * @returns {Object} 解析结果
   */
  parseLocal(text) {
    const cleanText = text.trim()

    const intent = {
      text: cleanText,
      device: this.extractDevice(cleanText),
      action: this.extractAction(cleanText),
      room: this.extractRoom(cleanText),
      parameters: this.extractParameters(cleanText),
      confidence: 0
    }

    intent.confidence = this.calculateConfidence(intent)

    return intent
  }

  /**
   * 提取设备信息
   */
  extractDevice(text) {
    for (const [alias, deviceId] of Object.entries(this.deviceAliases)) {
      if (text.includes(alias)) {
        return deviceId
      }
    }
    return null
  }

  /**
   * 提取动作
   */
  extractAction(text) {
    for (const [pattern, actionId] of Object.entries(this.actionPatterns)) {
      if (text.includes(pattern)) {
        return actionId
      }
    }
    return null
  }

  /**
   * 提取房间
   */
  extractRoom(text) {
    for (const [cnName, enName] of Object.entries(this.roomMapping)) {
      if (text.includes(cnName)) {
        return enName
      }
    }
    return null
  }

  /**
   * 提取参数
   */
  extractParameters(text) {
    const params = {}

    const tempMatch = text.match(/(\d+)度/)
    if (tempMatch) {
      params.temperature = parseInt(tempMatch[1])
    }

    const percentMatch = text.match(/(\d+)%/)
    if (percentMatch) {
      params.percent = parseInt(percentMatch[1])
    }

    const brightnessMatch = text.match(/亮度[调到]?(\d+)/)
    if (brightnessMatch) {
      params.brightness = parseInt(brightnessMatch[1])
    }

    const volumeMatch = text.match(/音量[调到]?(\d+)/)
    if (volumeMatch) {
      params.volume = parseInt(volumeMatch[1])
    }

    const valueMatch = text.match(/(\d+)/)
    if (valueMatch && !params.temperature && !params.percent && !params.brightness && !params.volume) {
      params.value = parseInt(valueMatch[1])
    }

    return params
  }

  /**
   * 计算解析置信度
   */
  calculateConfidence(intent) {
    let confidence = 0.3

    if (intent.device) {
      confidence += 0.3
    }

    if (intent.action) {
      confidence += 0.3
    }

    if (intent.room) {
      confidence += 0.1
    }

    if (Object.keys(intent.parameters).length > 0) {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * 判断是否为设备控制意图
   */
  isControlIntent(intent) {
    return intent.device !== null && intent.action !== null && intent.confidence >= 0.5
  }
}