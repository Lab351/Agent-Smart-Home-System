import ControlTransport from './ControlTransport.js'

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function parseJson(payload) {
  if (payload === null || payload === undefined) {
    return null
  }

  if (typeof payload === 'string') {
    return JSON.parse(payload)
  }

  if (typeof payload.data === 'string') {
    return JSON.parse(payload.data)
  }

  if (payload.data && typeof payload.data === 'object') {
    return payload.data
  }

  return payload
}

function extractOrigin(url) {
  const matched = /^https?:\/\/[^/]+/.exec(url)
  return matched ? matched[0] : null
}

function buildAgentCardUrl(agentUrl) {
  const origin = extractOrigin(agentUrl)
  if (!origin) {
    return null
  }
  return `${origin}/.well-known/agent-card.json`
}

function mapAgentCardToLegacyDescription(card, fallbackAgentId) {
  const devices = Array.isArray(card.devices) ? card.devices : []
  const skillIds = Array.isArray(card.skills)
    ? card.skills
      .map(skill => skill && skill.id)
      .filter(Boolean)
    : []
  const capabilities = Array.isArray(card.capabilities) && card.capabilities.length > 0
    ? card.capabilities
    : skillIds

  return {
    agent_id: card.id || fallbackAgentId || null,
    agent_type: card.agent_type || (card.metadata && card.metadata.agent_type) || 'room',
    devices,
    capabilities,
    raw_agent_card: card,
  }
}

export default class A2AControlTransport extends ControlTransport {
  constructor(options = {}) {
    super()
    this.requestFn = options.requestFn
    this.pollInterval = options.pollInterval || 1000
    this.maxPollAttempts = options.maxPollAttempts || 15

    this.connected = false
    this.agentUrl = null
    this.agentCardUrl = null
    this.roomId = null
    this.roomAgentId = null
    this.personalAgentId = null
    this.agentInfo = null
    this.descriptionCallbacks = []
    this.cachedDescription = null
  }

  async connect(options) {
    if (typeof this.requestFn !== 'function') {
      console.error('[A2AControlTransport] requestFn is required')
      return false
    }

    const agentInfo = options.agentInfo || {}
    if (!agentInfo.url) {
      console.warn('[A2AControlTransport] Missing agentInfo.url')
      return false
    }

    const agentCardUrl = buildAgentCardUrl(agentInfo.url)
    if (!agentCardUrl) {
      console.error('[A2AControlTransport] Invalid agentInfo.url:', agentInfo.url)
      return false
    }

    this.agentInfo = agentInfo
    this.agentUrl = agentInfo.url
    this.agentCardUrl = agentCardUrl
    this.roomId = options.roomId || null
    this.roomAgentId = options.roomAgentId || null
    this.personalAgentId = options.personalAgentId || null
    this.connected = true
    return true
  }

  disconnect() {
    this.connected = false
    this.agentUrl = null
    this.agentCardUrl = null
    this.roomId = null
    this.roomAgentId = null
    this.personalAgentId = null
    this.agentInfo = null
    this.cachedDescription = null
  }

  destroy() {
    this.disconnect()
  }

  isConnected() {
    return this.connected
  }

  async sendControl(options) {
    if (!this.connected || !this.agentUrl) {
      console.error('[A2AControlTransport] Not connected')
      return false
    }

    const requestId = generateUUID()
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: generateUUID(),
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: {
                kind: 'control_request',
                roomId: options.roomId,
                roomAgentId: options.roomAgentId,
                sourceAgent: options.sourceAgent,
                targetDevice: options.targetDevice,
                action: options.action,
                parameters: options.parameters || {},
                requestId,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        },
      },
    }

    try {
      const response = await this.requestFn({
        url: this.agentUrl,
        method: 'POST',
        data: payload,
      })
      return await this._resolveSendResult(parseJson(response))
    } catch (err) {
      console.error('[A2AControlTransport] Failed to send control:', err)
      return false
    }
  }

  async queryCapabilities(options) {
    if (!this.connected || !this.agentCardUrl) {
      console.error('[A2AControlTransport] Not connected')
      return null
    }

    try {
      const response = await this.requestFn({
        url: this.agentCardUrl,
        method: 'GET',
      })
      const card = parseJson(response)
      const description = mapAgentCardToLegacyDescription(
        card,
        options.roomAgentId || this.roomAgentId
      )
      this.cachedDescription = description
      this.descriptionCallbacks.forEach(callback => callback(description))
      return description
    } catch (err) {
      console.error('[A2AControlTransport] Failed to query capabilities:', err)
      return null
    }
  }

  async subscribeToState() {
    return false
  }

  async subscribeToDescription(roomId, callback) {
    this.descriptionCallbacks.push(callback)

    if (this.cachedDescription && roomId === this.roomId) {
      callback(this.cachedDescription)
    }

    return true
  }

  async _resolveSendResult(response) {
    if (!response || response.error) {
      return false
    }

    const result = response.result || response
    if (!result) {
      return false
    }

    if (result.kind === 'message') {
      return true
    }

    const task = result.kind === 'task' || result.status ? result : null
    if (!task) {
      return false
    }

    const state = task.status && task.status.state
    if (state === 'completed') {
      return true
    }

    if (this._isFailedState(state)) {
      return false
    }

    if (!task.id) {
      return false
    }

    return this._pollTaskUntilTerminal(task.id)
  }

  async _pollTaskUntilTerminal(taskId) {
    for (let index = 0; index < this.maxPollAttempts; index++) {
      await this._sleep(this.pollInterval)

      const response = await this.requestFn({
        url: this.agentUrl,
        method: 'POST',
        data: {
          jsonrpc: '2.0',
          id: generateUUID(),
          method: 'tasks/get',
          params: {
            id: taskId,
            historyLength: 20,
          },
        },
      })
      const result = parseJson(response)
      if (result && result.error) {
        return false
      }

      const task = result && result.result ? result.result : result
      const state = task && task.status ? task.status.state : null

      if (state === 'completed') {
        return true
      }

      if (this._isFailedState(state)) {
        return false
      }
    }

    return false
  }

  _isFailedState(state) {
    return ['failed', 'rejected', 'canceled'].indexOf(state) >= 0
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
