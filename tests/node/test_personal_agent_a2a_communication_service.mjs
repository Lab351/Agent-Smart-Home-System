import test from 'node:test'
import assert from 'node:assert/strict'

import A2ACommunicationService from '../../personal-agent/src/services/A2ACommunicationService.js'

function createFakeMqttService() {
  return {
    connected: true,
    subscriptions: [],
    published: [],
    connectCalls: [],
    async connect(options) {
      this.connectCalls.push(options)
      return true
    },
    async subscribe(topic, callback) {
      this.subscriptions.push({ topic, callback })
      return true
    },
    async publish(topic, payload) {
      this.published.push({ topic, payload: JSON.parse(payload) })
      return true
    },
    disconnectCalled: false,
    disconnect() {
      this.disconnectCalled = true
      this.connected = false
    },
    isConnected() {
      return this.connected
    },
  }
}

test('A2ACommunicationService subscribes to personal agent topics on connect', async () => {
  const mqttService = createFakeMqttService()
  const service = new A2ACommunicationService(mqttService)

  const connected = await service.connect({
    host: '127.0.0.1',
    port: 1883,
    roomId: 'bedroom',
    agentId: 'watch-user1',
    roomAgentId: 'room-agent-bedroom',
  })

  assert.equal(connected, true)
  assert.deepEqual(
    mqttService.subscriptions.map(subscription => subscription.topic),
    [
      'room/bedroom/agent/+/state',
      'room/bedroom/agent/+/description',
      'home/state',
      'home/policy',
      'home/arbitration/response/+',
    ]
  )
})

test('A2ACommunicationService routes room state, description, and home state messages by topic', () => {
  const service = new A2ACommunicationService(createFakeMqttService())
  const seen = {
    state: [],
    description: [],
    global: [],
  }

  service.onStateUpdate(message => seen.state.push(message))
  service.onDescriptionUpdate(message => seen.description.push(message))
  service.onGlobalStateUpdate(message => seen.global.push(message))

  service._handleMessage(
    'room/bedroom/agent/room-agent-bedroom/state',
    JSON.stringify({
      message_id: 'state-1',
      timestamp: '2026-03-20T00:00:00Z',
      source_agent: 'room-agent-bedroom',
      agent_id: 'room-agent-bedroom',
      agent_status: 'online',
      devices: [{ id: 'light-1' }],
    })
  )
  service._handleMessage(
    'room/bedroom/agent/room-agent-bedroom/description',
    JSON.stringify({
      message_id: 'desc-1',
      timestamp: '2026-03-20T00:00:00Z',
      source_agent: 'room-agent-bedroom',
      agent_id: 'room-agent-bedroom',
      agent_type: 'room',
      capabilities: ['adjust_lighting'],
    })
  )
  service._handleMessage(
    'home/state',
    JSON.stringify({
      message_id: 'home-1',
      timestamp: '2026-03-20T00:00:00Z',
      source_agent: 'central-agent',
      home_mode: 'sleep',
      active_users: ['user1'],
      risk_level: 'low',
    })
  )

  assert.equal(seen.state.length, 1)
  assert.equal(seen.state[0].agentId, 'room-agent-bedroom')
  assert.equal(seen.description.length, 1)
  assert.deepEqual(seen.description[0].capabilities, ['adjust_lighting'])
  assert.equal(seen.global.length, 1)
  assert.equal(seen.global[0].homeMode, 'sleep')
})

test('A2ACommunicationService routes arbitration responses by topic', () => {
  const service = new A2ACommunicationService(createFakeMqttService())
  const responses = []

  service.onArbitrationResponse(message => responses.push(message))

  service._handleMessage(
    'home/arbitration/response/request-1',
    JSON.stringify({
      message_id: 'arb-1',
      timestamp: '2026-03-20T00:00:00Z',
      source_agent: 'central-agent',
      request_id: 'request-1',
      decision: 'deny',
      reason: 'sleep mode',
    })
  )

  assert.equal(responses.length, 1)
  assert.equal(responses[0].requestId, 'request-1')
  assert.equal(responses[0].decision, 'deny')
})
