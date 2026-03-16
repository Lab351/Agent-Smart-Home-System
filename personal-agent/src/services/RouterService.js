/**
 * 智能路由服务
 * 根据大模型决策结果进行路由
 */

export default class RouterService {
  constructor(controlService, discoveryService, homeAgentService = null) {
    this.control = controlService
    this.discovery = discoveryService
    this.homeAgent = homeAgentService
    this.currentRoomId = null
    this.currentBeaconId = null

    console.log('[RouterService] Initialized')
  }

  /**
   * 设置当前房间
   */
  setCurrentRoom(roomId, beaconId) {
    this.currentRoomId = roomId
    this.currentBeaconId = beaconId
    console.log('[RouterService] Current room set to:', roomId, 'beacon:', beaconId)
  }

  /**
   * 路由决策
   * @param {Object} intent - 解析后的意图（包含 routing 信息）
   * @returns {Promise<Object>} 路由结果
   */
  async route(intent) {
    console.log('[RouterService] Routing intent:', intent)

    if (intent.routing) {
      return this.routeByLLMDecision(intent)
    }

    return this.routeByRules(intent)
  }

  /**
   * 根据 LLM 决策进行路由
   */
  async routeByLLMDecision(intent) {
    const routing = intent.routing
    const { device, action, parameters } = intent

    console.log('[RouterService] Using LLM routing decision:', routing)

    if (routing.target === 'room-agent') {
      return {
        target: 'room-agent',
        roomId: routing.room_id || this.currentRoomId,
        agentId: routing.agent_id || null,
        device,
        action,
        parameters,
        reason: routing.reason
      }
    }

    return {
      target: 'home-agent',
      reason: routing.reason || 'LLM 决策路由到 home-agent',
      intent
    }
  }

  /**
   * 根据规则进行路由（fallback）
   */
  async routeByRules(intent) {
    const { room, device, action, parameters } = intent

    if (room && room !== this.currentRoomId) {
      console.log('[RouterService] Cross-room control detected')
      return {
        target: 'home-agent',
        reason: 'cross_room_control',
        intent
      }
    }

    if (this.currentRoomId && this.currentBeaconId) {
      try {
        const agentInfo = await this.discovery.getRoomAgentByBeacon(this.currentBeaconId)

        if (agentInfo && this.hasDevice(agentInfo, device)) {
          console.log('[RouterService] Device found in current room')
          return {
            target: 'room-agent',
            roomId: this.currentRoomId,
            agentId: agentInfo.agent_id,
            device,
            action,
            parameters
          }
        }
      } catch (err) {
        console.error('[RouterService] Failed to get agent info:', err)
      }
    }

    console.log('[RouterService] Cannot handle locally, routing to home-agent')
    return {
      target: 'home-agent',
      reason: 'no_local_agent',
      intent
    }
  }

  /**
   * 检查设备是否在 agent 中
   */
  hasDevice(agentInfo, device) {
    if (!agentInfo.devices || !Array.isArray(agentInfo.devices)) {
      return false
    }

    return agentInfo.devices.some(d =>
      d.id === device || d.name === device || d.type === device
    )
  }

  /**
   * 执行路由
   */
  async executeRoute(intent) {
    const route = await this.route(intent)

    if (route.target === 'room-agent') {
      console.log('[RouterService] Sending to room-agent:', route)
      return await this.control.sendControl(
        route.roomId,
        route.device,
        route.action,
        route.parameters
      )
    } else if (route.target === 'home-agent') {
      console.log('[RouterService] Sending to home-agent:', route)
      if (this.homeAgent) {
        return await this.homeAgent.sendTask(route.intent)
      } else {
        console.error('[RouterService] HomeAgentService not available')
        return false
      }
    }

    return false
  }
}