import test from 'node:test'
import assert from 'node:assert/strict'

import A2AControlTransport from '../../personal-agent/src/services/transports/A2AControlTransport.js'

test('A2AControlTransport connect fails without agent url', async () => {
  const transport = new A2AControlTransport({
    requestFn: async () => ({}),
  })

  const success = await transport.connect({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    agentInfo: {},
    personalAgentId: 'watch-user1',
  })

  assert.equal(success, false)
})

test('A2AControlTransport maps Agent Card and triggers description callback', async () => {
  const calls = []
  const transport = new A2AControlTransport({
    requestFn: async (request) => {
      calls.push(request)
      if (request.method === 'GET') {
        return {
          id: 'room-agent-bedroom',
          agent_type: 'room',
          devices: [{ id: 'light', type: 'light' }],
          skills: [{ id: 'adjust_lighting' }],
        }
      }
      throw new Error('unexpected request')
    },
  })

  const connected = await transport.connect({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    agentInfo: {
      url: 'http://127.0.0.1:4040/a2a/jsonrpc',
    },
    personalAgentId: 'watch-user1',
  })
  assert.equal(connected, true)

  let callbackPayload = null
  await transport.subscribeToDescription('bedroom', (description) => {
    callbackPayload = description
  })

  const description = await transport.queryCapabilities({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
  })

  assert.equal(calls[0].url, 'http://127.0.0.1:4040/.well-known/agent-card.json')
  assert.deepEqual(description.devices, [{ id: 'light', type: 'light' }])
  assert.deepEqual(description.capabilities, ['adjust_lighting'])
  assert.equal(callbackPayload.agent_id, 'room-agent-bedroom')
})

test('A2AControlTransport sendControl emits structured data part and handles completed task', async () => {
  const calls = []
  const transport = new A2AControlTransport({
    requestFn: async (request) => {
      calls.push(request)
      return {
        result: {
          kind: 'task',
          id: 'task-1',
          status: {
            state: 'completed',
          },
        },
      }
    },
  })

  await transport.connect({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    agentInfo: {
      url: 'http://127.0.0.1:4040/a2a/jsonrpc',
    },
    personalAgentId: 'watch-user1',
  })

  const success = await transport.sendControl({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    sourceAgent: 'watch-user1',
    targetDevice: 'light',
    action: 'turn_on',
    parameters: { brightness: 80 },
  })

  assert.equal(success, true)
  assert.equal(calls.length, 1)
  const part = calls[0].data.params.message.parts[0]
  assert.equal(part.kind, 'data')
  assert.equal(part.data.kind, 'control_request')
  assert.equal(part.data.roomId, 'bedroom')
  assert.equal(part.data.roomAgentId, 'room-agent-bedroom')
  assert.equal(part.data.sourceAgent, 'watch-user1')
  assert.equal(part.data.targetDevice, 'light')
  assert.equal(part.data.action, 'turn_on')
  assert.deepEqual(part.data.parameters, { brightness: 80 })
  assert.ok(part.data.requestId)
  assert.ok(part.data.timestamp)
})

test('A2AControlTransport polls task state until completed', async () => {
  let pollCount = 0
  const transport = new A2AControlTransport({
    pollInterval: 0,
    maxPollAttempts: 3,
    requestFn: async (request) => {
      if (request.data.method === 'message/send') {
        return {
          result: {
            kind: 'task',
            id: 'task-2',
            status: {
              state: 'working',
            },
          },
        }
      }

      pollCount += 1
      return {
        result: {
          kind: 'task',
          id: 'task-2',
          status: {
            state: pollCount >= 2 ? 'completed' : 'working',
          },
        },
      }
    },
  })

  await transport.connect({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    agentInfo: {
      url: 'http://127.0.0.1:4040/a2a/jsonrpc',
    },
    personalAgentId: 'watch-user1',
  })

  const success = await transport.sendControl({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    sourceAgent: 'watch-user1',
    targetDevice: 'light',
    action: 'turn_on',
    parameters: {},
  })

  assert.equal(success, true)
  assert.equal(pollCount, 2)
})

test('A2AControlTransport returns false when task reaches failed state', async () => {
  const transport = new A2AControlTransport({
    pollInterval: 0,
    maxPollAttempts: 1,
    requestFn: async () => ({
      result: {
        kind: 'task',
        id: 'task-3',
        status: {
          state: 'failed',
        },
      },
    }),
  })

  await transport.connect({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    agentInfo: {
      url: 'http://127.0.0.1:4040/a2a/jsonrpc',
    },
    personalAgentId: 'watch-user1',
  })

  const success = await transport.sendControl({
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    sourceAgent: 'watch-user1',
    targetDevice: 'light',
    action: 'turn_on',
    parameters: {},
  })

  assert.equal(success, false)
})

test('A2AControlTransport subscribeToState is disabled in A2A mode', async () => {
  const transport = new A2AControlTransport({
    requestFn: async () => ({}),
  })

  assert.equal(await transport.subscribeToState('bedroom', () => {}), false)
})
