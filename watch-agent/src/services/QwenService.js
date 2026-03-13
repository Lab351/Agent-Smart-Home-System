/**
 * Qwen AI 服务
 * 调用后端 API 来使用 DashScope Qwen 模型
 */
import $ajax from '../helper/ajax'
import config from '../config/agent.config'

class QwenService {
  constructor() {
    this.backendUrl = config.backend?.url || 'http://localhost:3000'
    console.log('[QwenService] Initialized with backend:', this.backendUrl)
  }

  /**
   * 发送聊天消息
   * @param {string} message - 用户消息
   * @param {Array} conversationHistory - 对话历史（可选）
   * @param {string} systemPrompt - 系统提示词（可选）
   * @returns {Promise<string>} - AI 回复内容
   */
  async chat(message, conversationHistory = [], systemPrompt = null) {
    try {
      console.log('[QwenService] Sending chat request:', message)

      const response = await $ajax.post(
        `${this.backendUrl}/chat`,
        {
          message,
          conversationHistory,
          systemPrompt: systemPrompt || 'You are a helpful assistant.'
        }
      )

      console.log('[QwenService] Received response:', response)

      if (response && response.success && response.data) {
        return response.data.message
      }

      throw new Error('Invalid response format')
    } catch (error) {
      console.error('[QwenService] Chat failed:', error)
      throw error
    }
  }
}

export default QwenService
