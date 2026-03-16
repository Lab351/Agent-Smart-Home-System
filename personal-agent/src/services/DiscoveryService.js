/**
 * 服务发现服务
 * 通过后端 API 获取 room-agent 信息
 */

import $ajax from '../helper/ajax'
import config from '../config/agent.config'

export default class DiscoveryService {
  constructor(mqttService) {
    this.mqtt = mqttService
    this.beaconMap = new Map()
    this.backendUrl = config.backend?.url || 'http://120.78.228.69:3088'

    console.log('[DiscoveryService] Initialized with backend:', this.backendUrl)
  }

  async getRoomAgentByBeacon(beaconId) {
    if (this.beaconMap.has(beaconId)) {
      const cached = this.beaconMap.get(beaconId)
      console.log('[DiscoveryService] Cache hit for beacon:', beaconId)
      return cached
    }

    try {
      console.log('[DiscoveryService] Querying backend for beacon:', beaconId)

      const result = await $ajax.get(`${this.backendUrl}/api/beacon/${beaconId}`)

      if (result && result.success && result.data) {
        const data = result.data
        this.beaconMap.set(beaconId, data)
        console.log('[DiscoveryService] Found agent for beacon:', beaconId, data)
        return data
      }
    } catch (err) {
      console.error('[DiscoveryService] Failed to query beacon:', err)
    }

    console.warn('[DiscoveryService] No agent found for beacon:', beaconId)
    return null
  }

  async getRoomAgentByRoomId(roomId) {
    if (this.roomMap && this.roomMap.has(roomId)) {
      const cached = this.roomMap.get(roomId)
      console.log('[DiscoveryService] Cache hit for room:', roomId)
      return cached
    }

    try {
      console.log('[DiscoveryService] Querying backend for room:', roomId)

      const result = await $ajax.get(`${this.backendUrl}/api/beacon/room/${roomId}`)

      if (result && result.success && result.data) {
        const data = result.data
        if (!this.roomMap) {
          this.roomMap = new Map()
        }
        this.roomMap.set(roomId, data)
        console.log('[DiscoveryService] Found agent for room:', roomId, data)
        return data
      }
    } catch (err) {
      console.error('[DiscoveryService] Failed to query room:', err)
    }

    console.warn('[DiscoveryService] No agent found for room:', roomId)
    return null
  }

  async getAllRoomAgents() {
    try {
      console.log('[DiscoveryService] Querying all room agents')

      const result = await $ajax.get(`${this.backendUrl}/api/beacon/list`)

      if (result && result.success && result.data) {
        Object.entries(result.data).forEach(([beaconId, info]) => {
          this.beaconMap.set(beaconId, info)
        })

        const agents = Object.values(result.data)
        console.log('[DiscoveryService] Found', agents.length, 'room agents')
        return agents
      }
    } catch (err) {
      console.error('[DiscoveryService] Failed to list beacons:', err)
    }

    return []
  }

  async refreshCache() {
    console.log('[DiscoveryService] Refreshing cache')
    this.beaconMap.clear()
    return await this.getAllRoomAgents()
  }

  destroy() {
    console.log('[DiscoveryService] Destroying...')
    this.beaconMap.clear()
  }
}
