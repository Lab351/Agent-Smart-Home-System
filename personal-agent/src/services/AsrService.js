/**
 * 语音识别服务
 * 调用后端 ASR 接口进行语音识别
 */
import $ajax from '../helper/ajax'
import config from '../config/agent.config'

class AsrService {
  constructor() {
    this.backendUrl = config.backend?.url || 'http://localhost:3000'
    console.log('[AsrService] Initialized with backend:', this.backendUrl)
  }

  /**
   * 识别音频文件
   * @param {string} audioUri - 音频文件 URI（录音后返回的路径）
   * @param {string} format - 音频格式（aac/mp3/wav）
   * @param {number} sampleRate - 采样率
   * @returns {Promise<string>} - 识别的文本
   */
  async recognize(audioUri, format = 'aac', sampleRate = 16000) {
    try {
      console.log('[AsrService] Starting recognition:', { audioUri, format, sampleRate })

      // 直接使用 URI 上传到后端
      const response = await this.uploadToBackend(audioUri, format, sampleRate)

      console.log('[AsrService] Recognition result:', response)

      if (response && response.success && response.data) {
        return response.data.text
      }

      throw new Error('Invalid response format')
    } catch (error) {
      console.error('[AsrService] Recognition failed:', error)
      throw error
    }
  }

  /**
   * 上传到后端（使用文件 URI）
   */
  uploadToBackend(audioUri, format, sampleRate) {
    return new Promise((resolve, reject) => {
      const request = require('@system.request')

      console.log('[AsrService] Uploading audio file:', audioUri)

      request.upload({
        url: `${this.backendUrl}/asr`,
        files: [{
          uri: audioUri,
          name: 'file',
          filename: `audio.${format}`,
          type: `audio/${format}`
        }],
        data: [{
          name: 'format',
          value: format
        }, {
          name: 'sampleRate',
          value: sampleRate.toString()
        }],
        success: function(response) {
          try {
            console.log('[AsrService] Upload success, response:', response)
            const result = JSON.parse(response.data)
            console.log('[AsrService] Backend response:', result)
            resolve(result)
          } catch (err) {
            console.error('[AsrService] Failed to parse response:', err)
            reject(new Error('Invalid response format'))
          }
        },
        fail: function(data, code) {
          console.error('[AsrService] Request failed:', code, data)
          reject(new Error(`ASR request failed: ${code}`))
        }
      })
    })
  }

  /**
   * ArrayBuffer 转 Base64
   */
  arrayBufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)

    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    // 快应用可能没有 btoa，使用手动实现
    try {
      return typeof btoa !== 'undefined' ? btoa(binary) : this.base64Encode(binary)
    } catch (err) {
      return this.base64Encode(binary)
    }
  }

  /**
   * 手动 Base64 编码
   */
  base64Encode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    let result = ''

    for (let i = 0; i < str.length; i += 3) {
      const a = str.charCodeAt(i)
      const b = str.charCodeAt(i + 1) || 0
      const c = str.charCodeAt(i + 2) || 0

      result += chars[a >> 2]
      result += chars[((a & 3) << 4) | (b >> 4)]
      result += chars[((b & 15) << 2) | (c >> 6)]
      result += chars[c & 63]
    }

    // 处理结尾
    const padding = str.length % 3
    if (padding === 1) {
      result = result.slice(0, -2) + '=='
    } else if (padding === 2) {
      result = result.slice(0, -1) + '='
    }

    return result
  }

  /**
   * 识别音频文件（备用方法 - multipart）
   * 注意：快应用的 fetch 对 multipart 支持有限，推荐使用 Base64 方式
   */
  async recognizeMultipart(audioUri, format = 'aac', sampleRate = 16000) {
    // 此方法为备用，实际使用 recommend 使用 recognize()
    console.warn('[AsrService] Multipart method not recommended, use recognize() instead')
    return this.recognize(audioUri, format, sampleRate)
  }
}

export default AsrService
