function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

function ensureJson(data) {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }
  return data
}

function extractOrigin(url) {
  const matched = /^https?:\/\/[^/]+/.exec(url)
  return matched ? matched[0] : null
}

function loadQuickAppFetch() {
  if (typeof require !== 'function') {
    throw new Error('Quick App fetch module is unavailable in this environment')
  }

  const fetchModule = require('@system.fetch')
  if (!fetchModule || typeof fetchModule.fetch !== 'function') {
    throw new Error('Quick App fetch module does not expose fetch()')
  }

  return fetchModule.fetch.bind(fetchModule)
}

export default class A2AClientDemoService {
  constructor(options = {}) {
    this.timeout = options.timeout || 15000
    this.defaultHeaders = options.headers || {}
    this.requestFn = options.requestFn || null
  }

  buildAgentCardUrl(baseUrl) {
    if (!baseUrl) {
      throw new Error('baseUrl is required')
    }

    if (baseUrl.indexOf('/.well-known/agent-card.json') >= 0) {
      return baseUrl
    }

    const origin = extractOrigin(baseUrl)
    if (!origin) {
      throw new Error('baseUrl must be an absolute http(s) URL')
    }

    return `${origin}/.well-known/agent-card.json`
  }

  async fetchAgentCard(baseUrl) {
    const url = this.buildAgentCardUrl(baseUrl)
    return this._request({
      url,
      method: 'GET',
    })
  }

  async sendTextMessage(options) {
    const {
      agentUrl,
      text,
      taskId = null,
      metadata = {},
      configuration = null,
    } = options

    if (!agentUrl) {
      throw new Error('agentUrl is required')
    }

    if (!text) {
      throw new Error('text is required')
    }

    const requestId = generateId('rpc')
    const messageId = generateId('msg')
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              text,
            },
          ],
          taskId: taskId || undefined,
        },
        metadata,
      },
    }

    if (configuration) {
      payload.params.configuration = configuration
    }

    return this._request({
      url: agentUrl,
      method: 'POST',
      data: payload,
    })
  }

  async getTask(options) {
    const { agentUrl, taskId, historyLength = 20 } = options

    if (!agentUrl) {
      throw new Error('agentUrl is required')
    }

    if (!taskId) {
      throw new Error('taskId is required')
    }

    return this._request({
      url: agentUrl,
      method: 'POST',
      data: {
        jsonrpc: '2.0',
        id: generateId('rpc'),
        method: 'tasks/get',
        params: {
          id: taskId,
          historyLength,
        },
      },
    })
  }

  async pollTaskUntilTerminal(options) {
    const {
      agentUrl,
      taskId,
      historyLength = 20,
      interval = 1000,
      maxAttempts = 15,
    } = options

    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.getTask({
        agentUrl,
        taskId,
        historyLength,
      })
      const state = this.getTaskState(response)

      if (this.isTerminalState(state)) {
        return response
      }

      await this._sleep(interval)
    }

    throw new Error(`Task ${taskId} did not reach terminal state`)
  }

  getTaskState(jsonRpcResponse) {
    const task = jsonRpcResponse && jsonRpcResponse.result
    return task && task.status ? task.status.state : null
  }

  isTerminalState(state) {
    return [
      'completed',
      'failed',
      'canceled',
      'rejected',
      'input-required',
      'auth-required',
    ].indexOf(state) >= 0
  }

  extractText(result) {
    if (!result || !result.result) {
      return ''
    }

    const payload = result.result
    const directMessage = payload.kind === 'message' ? payload : null
    if (directMessage && directMessage.parts && directMessage.parts.length > 0) {
      return directMessage.parts
        .filter(part => part.kind === 'text')
        .map(part => part.text)
        .join('\n')
    }

    const taskMessage = payload.status && payload.status.message
    if (taskMessage && taskMessage.parts && taskMessage.parts.length > 0) {
      return taskMessage.parts
        .filter(part => part.kind === 'text')
        .map(part => part.text)
        .join('\n')
    }

    return ''
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  _request(options) {
    const requestFn = this.requestFn || loadQuickAppFetch()
    const requestOptions = {
      url: options.url,
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...this.defaultHeaders,
        ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
    }

    if (options.data) {
      requestOptions.data = options.data
    }

    return Promise.race([
      new Promise((resolve, reject) => {
        requestFn(requestOptions)
          .then(response => {
            const body = ensureJson(response.data)
            resolve(body)
          })
          .catch(error => {
            reject(error)
          })
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout: ${options.url}`))
        }, this.timeout)
      }),
    ])
  }
}
