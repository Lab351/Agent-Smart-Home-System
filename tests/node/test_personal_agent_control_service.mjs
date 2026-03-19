import test from 'node:test'
import assert from 'node:assert/strict'

import ControlService from '../../personal-agent/src/services/ControlService.js'

test('ControlService delegates sendControl to active transport', async () => {
  const captured = []
  const transport = {
    isConnected() {
      return true
    },
    async sendControl(payload) {
      captured.push(payload)
      return true
    },
    async queryCapabilities() {
      return null
    },
    async subscribeToState() {
      return false
    },
    async subscribeToDescription() {
      return true
    },
    disconnect() {},
  }

  const service = new ControlService(null, { personalAgentId: 'watch-user1' })
  service.setRoomAgent('bedroom', 'room-agent-bedroom')
  service.setTransport(transport)

  const success = await service.sendControl('bedroom', 'light', 'turn_on', { brightness: 80 })

  assert.equal(success, true)
  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0], {
    roomId: 'bedroom',
    roomAgentId: 'room-agent-bedroom',
    targetDevice: 'light',
    action: 'turn_on',
    parameters: { brightness: 80 },
    sourceAgent: 'watch-user1',
  })
})

test('ControlService replaces the current transport cleanly', async () => {
  let disconnected = 0
  const oldTransport = {
    isConnected() {
      return false
    },
    disconnect() {
      disconnected += 1
    },
  }
  const nextTransport = {
    isConnected() {
      return false
    },
    disconnect() {},
  }

  const service = new ControlService()
  service.setTransport(oldTransport)
  service.setTransport(nextTransport)

  assert.equal(disconnected, 1)
  assert.equal(service.getTransport(), nextTransport)
})
