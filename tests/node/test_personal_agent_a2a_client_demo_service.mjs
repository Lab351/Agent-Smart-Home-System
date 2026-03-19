import test from 'node:test'
import assert from 'node:assert/strict'

import A2AClientDemoService from '../../personal-agent/src/services/A2AClientDemoService.js'

test('A2AClientDemoService builds agent card url from base url', () => {
  const service = new A2AClientDemoService()

  assert.equal(
    service.buildAgentCardUrl('http://127.0.0.1:9000/a2a/jsonrpc'),
    'http://127.0.0.1:9000/.well-known/agent-card.json'
  )
  assert.equal(
    service.buildAgentCardUrl('http://127.0.0.1:9000/.well-known/agent-card.json'),
    'http://127.0.0.1:9000/.well-known/agent-card.json'
  )
})

test('A2AClientDemoService sends text message payload with optional configuration', async () => {
  const calls = []
  const service = new A2AClientDemoService({
    requestFn: async (requestOptions) => {
      calls.push(requestOptions)
      return {
        data: JSON.stringify({
          result: {
            kind: 'message',
            messageId: 'assistant-1',
            parts: [{ kind: 'text', text: 'ok' }],
          },
        }),
      }
    },
  })

  const result = await service.sendTextMessage({
    agentUrl: 'http://127.0.0.1:9000/a2a/jsonrpc',
    text: 'turn on the light',
    taskId: 'task-1',
    metadata: { roomId: 'bedroom' },
    configuration: { acceptedOutputModes: ['text'] },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
  assert.equal(calls[0].data.method, 'message/send')
  assert.equal(calls[0].data.params.message.parts[0].text, 'turn on the light')
  assert.equal(calls[0].data.params.message.taskId, 'task-1')
  assert.deepEqual(calls[0].data.params.configuration, {
    acceptedOutputModes: ['text'],
  })
  assert.equal(result.result.kind, 'message')
})

test('A2AClientDemoService polls tasks until terminal state', async () => {
  let taskReads = 0
  const service = new A2AClientDemoService({
    interval: 0,
    requestFn: async (requestOptions) => {
      taskReads += 1
      return {
        data: {
          result: {
            id: requestOptions.data.params.id,
            status: {
              state: taskReads >= 2 ? 'completed' : 'working',
            },
          },
        },
      }
    },
  })

  const result = await service.pollTaskUntilTerminal({
    agentUrl: 'http://127.0.0.1:9000/a2a/jsonrpc',
    taskId: 'task-42',
    interval: 0,
    maxAttempts: 3,
  })

  assert.equal(taskReads, 2)
  assert.equal(result.result.status.state, 'completed')
})

test('A2AClientDemoService extracts text from direct messages and task status messages', () => {
  const service = new A2AClientDemoService()

  assert.equal(
    service.extractText({
      result: {
        kind: 'message',
        parts: [
          { kind: 'text', text: 'hello' },
          { kind: 'data', data: { ignored: true } },
          { kind: 'text', text: 'world' },
        ],
      },
    }),
    'hello\nworld'
  )

  assert.equal(
    service.extractText({
      result: {
        status: {
          message: {
            parts: [{ kind: 'text', text: 'task complete' }],
          },
        },
      },
    }),
    'task complete'
  )
})
