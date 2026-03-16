/**
 * Personal Agent 配置文件模板
 *
 * 复制此文件为 agent.config.js 并填入实际的配置值
 * 警告：agent.config.js 包含敏感信息，已被 .gitignore 忽略，请勿提交到 Git
 */

export default {
  // Agent 信息
  agent: {
    id: 'personal-agent-watch',
    userId: 'user1',
    version: '1.0.0'
  },

  // MQTT Broker 配置
  mqtt: {
    host: 'YOUR_MQTT_BROKER_HOST',
    port: 1884,
    wsPort: 9002,
    qos: 1,
    keepAlive: 60
  },

  // 后端服务配置
  backend: {
    // 你的后端服务地址（运行在 VPS 上）
    url: 'http://YOUR_VPS_IP:3000'
  },

  // OpenAI API 配置（已弃用 - 现在由后端服务统一管理）
  // 后端服务会处理 DashScope API 调用，保护 API Key 安全
  // 如果你想在本地运行后端，请配置 qwen-backend/.env 文件

  // Beacon 配置
  beacon: {
    uuid: '01234567-89AB-CDEF-0123456789ABCDEF',
    scanInterval: 1, // 秒
    rssiThreshold: -70, // dBm
    roomMapping: {
      1: 'livingroom',
      2: 'bedroom',
      3: 'study'
    }
  },

  // 用户偏好
  preferences: {
    defaultRoom: 'livingroom',
    preferredDevices: {
      livingroom: 'ceiling_light',
      bedroom: 'bedside_lamp'
    }
  }
}
