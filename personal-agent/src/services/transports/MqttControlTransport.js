import ControlTransport from './ControlTransport.js'

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default class MqttControlTransport extends ControlTransport {
  constructor(mqttService) {
    super()
    this.mqtt = mqttService
    this.messageCallbacks = new Map()
  }

  async connect(options) {
    if (!this.mqtt) {
      console.error('[MqttControlTransport] MQTT service is required')
      return false
    }

    if (this.mqtt.isConnected()) {
      return true
    }

    const agentInfo = options.agentInfo || {}
    const fallbackBroker = options.fallbackBroker || {}
    const personalAgentId = options.personalAgentId || `watch-${Date.now()}`
    const host = agentInfo.mqtt_broker || fallbackBroker.host
    const port = agentInfo.mqtt_ws_port || fallbackBroker.port

    if (!host || !port) {
      console.error('[MqttControlTransport] Missing broker host or port')
      return false
    }

    return this.mqtt.connect({
      host,
      port,
      clientId: personalAgentId,
    })
  }

  disconnect() {
    if (this.mqtt && this.mqtt.isConnected()) {
      this.mqtt.disconnect()
    }
    this.messageCallbacks.clear()
  }

  isConnected() {
    return !!this.mqtt && this.mqtt.isConnected()
  }

  async sendControl(options) {
    if (!this.isConnected()) {
      console.error('[MqttControlTransport] MQTT not connected')
      return false
    }

    const message = {
      message_id: generateUUID(),
      timestamp: new Date().toISOString(),
      source_agent: options.sourceAgent,
      target_device: options.targetDevice,
      action: options.action,
      parameters: options.parameters || {},
    }
    const topic = `room/${options.roomId}/agent/${options.roomAgentId}/control`

    console.log('[MqttControlTransport] Sending control:', { topic, message })

    try {
      return await this.mqtt.publish(topic, JSON.stringify(message))
    } catch (err) {
      console.error('[MqttControlTransport] Failed to send control:', err)
      return false
    }
  }

  async queryCapabilities(options) {
    if (!this.isConnected()) {
      console.error('[MqttControlTransport] MQTT not connected')
      return false
    }

    const message = {
      message_id: generateUUID(),
      timestamp: new Date().toISOString(),
      source_agent: options.sourceAgent,
      query_type: 'capabilities',
    }
    const topic = `room/${options.roomId}/agent/${options.roomAgentId}/describe`

    console.log('[MqttControlTransport] Querying capabilities:', { topic, message })

    try {
      return await this.mqtt.publish(topic, JSON.stringify(message))
    } catch (err) {
      console.error('[MqttControlTransport] Failed to query capabilities:', err)
      return false
    }
  }

  async subscribeToState(roomId, callback, options = {}) {
    if (!this.isConnected()) {
      console.error('[MqttControlTransport] MQTT not connected')
      return false
    }

    const roomAgentId = options.roomAgentId || roomId
    const topic = `room/${roomId}/agent/${roomAgentId}/state`

    console.log('[MqttControlTransport] Subscribing to state:', topic)

    try {
      const success = await this.mqtt.subscribe(topic, (payload) => {
        console.log('[MqttControlTransport] State update:', topic, payload)
        try {
          callback(JSON.parse(payload))
        } catch (err) {
          console.error('[MqttControlTransport] Failed to parse state:', err)
        }
      })

      if (success) {
        this.messageCallbacks.set(topic, callback)
      }

      return success
    } catch (err) {
      console.error('[MqttControlTransport] Failed to subscribe to state:', err)
      return false
    }
  }

  async subscribeToDescription(roomId, callback, options = {}) {
    if (!this.isConnected()) {
      console.error('[MqttControlTransport] MQTT not connected')
      return false
    }

    const roomAgentId = options.roomAgentId || roomId
    const topic = `room/${roomId}/agent/${roomAgentId}/description`

    console.log('[MqttControlTransport] Subscribing to description:', topic)

    try {
      const success = await this.mqtt.subscribe(topic, (payload) => {
        console.log('[MqttControlTransport] Description received:', payload)
        try {
          callback(JSON.parse(payload))
        } catch (err) {
          console.error('[MqttControlTransport] Failed to parse description:', err)
        }
      })

      if (success) {
        this.messageCallbacks.set(topic, callback)
      }

      return success
    } catch (err) {
      console.error('[MqttControlTransport] Failed to subscribe to description:', err)
      return false
    }
  }

  destroy() {
    if (this.mqtt) {
      for (const [topic] of this.messageCallbacks) {
        this.mqtt.unsubscribe(topic)
      }
      if (this.mqtt.isConnected()) {
        this.mqtt.disconnect()
      }
    }
    this.messageCallbacks.clear()
  }
}
