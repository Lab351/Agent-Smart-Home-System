/**
 * MQTT over WebSocket 通信服务
 *
 * 负责与 Room/Central Agent 通信
 * 使用快应用原生 WebSocket 实现 MQTT 3.1.1 协议
 */

function loadWebSocketFactory() {
  if (typeof require !== 'function') {
    throw new Error('Quick App websocket factory is unavailable in this environment')
  }

  const websocketfactory = require('@system.websocketfactory')
  if (!websocketfactory || typeof websocketfactory.create !== 'function') {
    throw new Error('Quick App websocket factory does not expose create()')
  }

  return websocketfactory
}

export default class MqttService {
  constructor() {
    this.ws = null
    this.connected = false
    this.broker = null
    this.messageCallbacks = new Map()
    this.pendingSubscribes = []
    this.pingInterval = null

    console.log('[MqttService] Initialized')
  }

  /**
   * 连接到 MQTT broker (通过 WebSocket)
   * @param {Object} options - 连接选项 { host, port, clientId }
   * @returns {Promise<boolean>} 是否连接成功
   */
  async connect(options) {
    console.log('[MqttService] Connecting to broker via WebSocket:', options)

    const host = options.host || '120.78.228.69'
    const port = options.port || 9002
    const clientId = options.clientId || 'watch-agent-' + Date.now()

    // 构建 WebSocket URL
    const wsUrl = `ws://${host}:${port}/mqtt`

    console.log('[MqttService] WebSocket URL:', wsUrl)
    console.log('[MqttService] Client ID:', clientId)

    return new Promise((resolve) => {
      try {
        const websocketfactory = loadWebSocketFactory()
        // 创建快应用 WebSocket 连接
        this.ws = websocketfactory.create({
          url: wsUrl,
          protocols: ['mqtt']
        })

        // 设置连接超时
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            console.error('[MqttService] Connection timeout')
            this.ws.close({ code: 1000, reason: 'timeout' })
            resolve(false)
          }
        }, 10000)

        // 监听连接打开事件
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          console.log('[MqttService] WebSocket connected, sending MQTT CONNECT')

          // 发送 MQTT CONNECT 包
          const connectPacket = this.buildConnectPacket(clientId)
          const packetArray = new Uint8Array(connectPacket)
          console.log('[MqttService] CONNECT packet:', Array.from(packetArray))
          console.log('[MqttService] Keep Alive bytes:', packetArray[10], packetArray[11])

          // 快应用 send 方法 - 直接发送 ArrayBuffer
          this.ws.send({
            data: connectPacket,
            success: () => {
              console.log('[MqttService] CONNECT packet sent successfully')
            },
            fail: (err, code) => {
              console.error('[MqttService] Failed to send CONNECT packet:', code, err)
            }
          })
        }

        // 监听消息接收事件
        this.ws.onmessage = (data) => {
          console.log('[MqttService] Raw message type:', typeof data.data)
          // 快应用返回的 data.data 可能是 ArrayBuffer
          const bytes = new Uint8Array(data.data)
          console.log('[MqttService] Raw message:', Array.from(bytes))
          this.handleMessage(bytes.buffer)
        }

        // 监听连接关闭事件
        this.ws.onclose = (data) => {
          clearTimeout(connectionTimeout)
          this.connected = false
          console.log('[MqttService] WebSocket closed, code:', data.code, 'reason:', data.reason)
          this.stopPing()
        }

        // 监听错误事件
        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          console.error('[MqttService] WebSocket error:', error)
        }

        this.broker = { host, port, clientId, wsUrl }

        // 等待 CONNACK 包
        this.waitForConnack().then((success) => {
          if (success) {
            this.connected = true
            console.log('[MqttService] Connected to broker')
            this.startPing()
            resolve(true)
          } else {
            console.error('[MqttService] Connection failed')
            resolve(false)
          }
        })

      } catch (err) {
        console.error('[MqttService] Failed to create WebSocket:', err)
        resolve(false)
      }
    })
  }

  /**
   * 等待 CONNACK 包
   * @returns {Promise<boolean>}
   */
  waitForConnack() {
    return new Promise((resolve) => {
      // 设置 5 秒超时
      const timeout = setTimeout(() => {
        console.error('[MqttService] CONNACK timeout')
        this.ws._connackHandler = null
        resolve(false)
      }, 5000)

      // 保存回调函数，在 handleMessage 中调用
      this.ws._connackHandler = (success) => {
        clearTimeout(timeout)
        this.ws._connackHandler = null
        resolve(success)
      }
    })
  }

  /**
   * 将字节数组转为 UTF-8 字符串
   */
  bytesToString(bytes) {
    let str = ''
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i])
    }
    return str
  }

  /**
   * 将字符串转为 UTF-8 字节数组
   */
  stringToBytes(str) {
    const bytes = []
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code < 0x80) {
        bytes.push(code)
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6))
        bytes.push(0x80 | (code & 0x3F))
      } else {
        bytes.push(0xE0 | (code >> 12))
        bytes.push(0x80 | ((code >> 6) & 0x3F))
        bytes.push(0x80 | (code & 0x3F))
      }
    }
    return bytes
  }

  /**
   * 编码 MQTT 剩余长度（可变长度编码）
   */
  encodeRemainingLength(length) {
    const encoded = []
    let x = length

    do {
      let encodedByte = x % 128
      x = Math.floor(x / 128)
      if (x > 0) {
        encodedByte = encodedByte | 0x80
      }
      encoded.push(encodedByte)
    } while (x > 0)

    return encoded
  }

  /**
   * 构建 MQTT CONNECT 包
   */
  buildConnectPacket(clientId) {
    const clientIdBytes = this.stringToBytes(clientId)
    const remainingLengthValue = 10 + 2 + clientIdBytes.length
    const remainingLength = this.encodeRemainingLength(remainingLengthValue)

    const packet = [
      // Fixed Header
      0x10,  // CONNECT packet type
      ...remainingLength,  // 剩余长度（可变长度编码）

      // Variable Header (10 bytes)
      0x00,  // Protocol name length MSB
      0x04,  // Protocol name length LSB
      0x4D,  // 'M'
      0x51,  // 'Q'
      0x54,  // 'T'
      0x54,  // 'T'
      0x04,  // Protocol version (MQTT 3.1.1)
      0x02,  // Connect flags (Clean session = 1)
      0x00,  // Keep alive MSB (60 seconds)
      0x3C,  // Keep alive LSB (60 seconds = 0x003C)

      // Payload: Client ID
      (clientIdBytes.length >> 8) & 0xFF,  // Client ID length MSB
      clientIdBytes.length & 0xFF           // Client ID length LSB
    ]

    // 添加 Client ID 字节
    packet.push(...clientIdBytes)

    return new Uint8Array(packet).buffer
  }

  /**
   * 构建 MQTT PUBLISH 包
   */
  buildPublishPacket(topic, payload) {
    const topicBytes = this.stringToBytes(topic)
    const payloadBytes = this.stringToBytes(payload)
    const remainingLengthValue = 2 + topicBytes.length + payloadBytes.length
    const remainingLength = this.encodeRemainingLength(remainingLengthValue)

    const packet = [
      0x30,  // PUBLISH packet type (QoS 0, no retain, no duplicate)
      ...remainingLength,  // 剩余长度（可变长度编码）
      // Topic
      (topicBytes.length >> 8) & 0xFF,
      topicBytes.length & 0xFF,
      ...topicBytes,
      // Payload
      ...payloadBytes
    ]

    return new Uint8Array(packet).buffer
  }

  /**
   * 构建 MQTT SUBSCRIBE 包
   */
  buildSubscribePacket(topic) {
    const topicBytes = this.stringToBytes(topic)
    const remainingLengthValue = 2 + 2 + topicBytes.length + 1
    const remainingLength = this.encodeRemainingLength(remainingLengthValue)

    const packet = [
      0x82,  // SUBSCRIBE packet type
      ...remainingLength,  // 剩余长度（可变长度编码）
      // Packet identifier
      0x00,
      0x01,
      // Topic
      (topicBytes.length >> 8) & 0xFF,
      topicBytes.length & 0xFF,
      ...topicBytes,
      // QoS
      0x00  // QoS 0
    ]

    return new Uint8Array(packet).buffer
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(data) {
    try {
      const bytes = new Uint8Array(data)
      if (bytes.length === 0) return

      // 解析包类型
      const packetType = (bytes[0] >> 4) & 0x0F

      console.log('[MqttService] Received packet type:', packetType)

      switch (packetType) {
        case 2: // CONNACK
          console.log('[MqttService] CONNACK received')
          if (this.ws._connackHandler) {
            // 检查返回码（第二个字节的低4位）
            const returnCode = bytes[3] & 0x0F
            if (returnCode === 0) {
              console.log('[MqttService] Connection accepted')
              this.ws._connackHandler(true)
            } else {
              console.error('[MqttService] Connection rejected, code:', returnCode)
              this.ws._connackHandler(false)
            }
          }
          break

        case 3: // PUBLISH
          this.handlePublishPacket(bytes)
          break

        case 9: // SUBACK
          console.log('[MqttService] SUBACK received')
          break

        case 12: // PINGRESP
          console.log('[MqttService] PINGRESP received')
          break

        default:
          console.log('[MqttService] Unknown packet type:', packetType)
      }
    } catch (err) {
      console.error('[MqttService] Failed to parse message:', err)
    }
  }

  /**
   * 处理 PUBLISH 包
   */
  handlePublishPacket(bytes) {
    try {
      // 跳过固定头部和剩余长度
      let offset = 2

      // 读取主题长度
      const topicLength = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2

      // 读取主题
      const topicBytes = bytes.slice(offset, offset + topicLength)
      const topic = this.bytesToString(topicBytes)
      offset += topicLength

      // 跳过包标识符（QoS 0 没有）
      // 读取有效载荷
      const payloadBytes = bytes.slice(offset)
      const payload = this.bytesToString(payloadBytes)

      console.log('[MqttService] PUBLISH:', topic, payload)

      // 调用回调函数
      for (const [subscribedTopic, callback] of this.messageCallbacks) {
        if (this.topicMatch(subscribedTopic, topic)) {
          callback(payload, topic)
        }
      }
    } catch (err) {
      console.error('[MqttService] Failed to parse PUBLISH packet:', err)
    }
  }

  /**
   * 发布消息到指定主题
   */
  async publish(topic, payload) {
    console.log('[MqttService] Publishing to topic:', topic)
    console.log('[MqttService] Payload:', payload)

    if (!this.connected || !this.ws) {
      console.error('[MqttService] Not connected')
      return false
    }

    try {
      const publishPacket = this.buildPublishPacket(topic, payload)
      this.ws.send({
        data: publishPacket,
        success: () => {
          console.log('[MqttService] Message published successfully')
        },
        fail: (err, code) => {
          console.error('[MqttService] Publish failed:', code, err)
        }
      })
      return true
    } catch (err) {
      console.error('[MqttService] Publish error:', err)
      return false
    }
  }

  /**
   * 订阅主题
   */
  async subscribe(topic, callback) {
    console.log('[MqttService] Subscribing to topic:', topic)

    if (!this.connected || !this.ws) {
      console.error('[MqttService] Not connected')
      return false
    }

    try {
      const subscribePacket = this.buildSubscribePacket(topic)
      this.ws.send({
        data: subscribePacket,
        success: () => {
          console.log('[MqttService] Subscribe packet sent successfully')
        },
        fail: (err, code) => {
          console.error('[MqttService] Subscribe failed:', code, err)
        }
      })

      // 保存回调函数
      this.messageCallbacks.set(topic, callback)

      console.log('[MqttService] Subscribed successfully')
      return true
    } catch (err) {
      console.error('[MqttService] Subscribe error:', err)
      return false
    }
  }

  /**
   * 取消订阅主题
   */
  unsubscribe(topic) {
    console.log('[MqttService] Unsubscribing from topic:', topic)
    this.messageCallbacks.delete(topic)
  }

  /**
   * 主题匹配（支持通配符）
   */
  topicMatch(pattern, topic) {
    if (pattern === '#') {
      return true
    }

    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\+/g, '[^/]+')
      .replace(/#/g, '.*')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(topic)
  }

  /**
   * 启动心跳
   */
  startPing() {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws) {
        // PINGREQ 包：固定头部 0xC0, 剩余长度 0
        const pingPacket = new Uint8Array([0xC0, 0x00])
        this.ws.send({
          data: pingPacket.buffer,
          success: () => {
            console.log('[MqttService] PING sent')
          },
          fail: (err, code) => {
            console.error('[MqttService] PING failed:', code, err)
          }
        })
      }
    }, 30000) // 30秒心跳
  }

  /**
   * 停止心跳
   */
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('[MqttService] Disconnecting...')

    this.stopPing()

    if (this.ws) {
      // DISCONNECT 包：固定头部 0xE0, 剩余长度 0
      const disconnectPacket = new Uint8Array([0xE0, 0x00])
      this.ws.send({
        data: disconnectPacket.buffer,
        success: () => {
          this.ws.close({
            code: 1000,
            reason: 'normal close',
            success: () => {
              this.ws = null
            },
            fail: () => {
              this.ws = null
            }
          })
        },
        fail: () => {
          this.ws.close({
            code: 1000,
            reason: 'normal close',
            success: () => {
              this.ws = null
            },
            fail: () => {
              this.ws = null
            }
          })
        }
      })
    }

    this.messageCallbacks.clear()
    this.connected = false

    console.log('[MqttService] Disconnected')
  }

  /**
   * 检查连接状态
   */
  isConnected() {
    return this.connected && this.ws !== null
  }
}
