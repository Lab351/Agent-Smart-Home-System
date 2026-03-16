/**
 * BLE Beacon 扫描和房间发现服务
 *
 * 负责扫描 iBeacon 设备，解析房间信息
 * 实现 RSSI 迟滞防止快速抖动
 */

import bluetooth from '@system.bluetooth'
import { extractESP32BeaconFromDevice, getRoomIdFromMajor, getRoomDisplayName } from '../utils/esp32_beacon_parser'
import config from '../config/agent.config'

const RSSI_THRESHOLD = -70
const RSSI_HYSTERESIS = 5

export default class BeaconService {
  constructor() {
    this.scanning = false
    this.adapterReady = false
    this.discoveredBeacons = new Map() // deviceId -> beacon info
    this.currentRoomId = null
    this.currentBeacon = null
    this.lastRssi = RSSI_THRESHOLD // 用于迟滞计算

    // 事件回调
    this.onBeaconDiscovered = null
    this.onRoomChanged = null
    this.onError = null

    console.log('[BeaconService] Initialized')
  }

  /**
   * 初始化蓝牙适配器
   * @returns {Promise<boolean>} 是否初始化成功
   */
  async initAdapter() {
    return new Promise((resolve) => {
      bluetooth.openAdapter({
        operateAdapter: true,
        success: () => {
          console.log('[BeaconService] Adapter initialized')
          this.adapterReady = true
          this.setupEventHandlers()
          resolve(true)
        },
        fail: (data, code) => {
          console.error('[BeaconService] Failed to init adapter:', code)
          this.adapterReady = false
          this.handleError('初始化失败', code)
          resolve(false)
        }
      })
    })
  }

  /**
   * 设置事件监听
   */
  setupEventHandlers() {
    const _this = this

    // 适配器状态变化
    bluetooth.onadapterstatechange = function (data) {
      console.log('[BeaconService] Adapter state:', data.available)
      _this.adapterReady = data.available

      if (!data.available) {
        // 适配器被关闭，清理状态
        _this.stopScanning()
        _this.discoveredBeacons.clear()
        _this.notifyRoomChanged(null, null)
      }
    }
  }

  /**
   * 开始扫描 Beacon 设备
   * @returns {Promise<boolean>} 是否开始扫描成功
   */
  async startScanning() {
    if (this.scanning) {
      console.log('[BeaconService] Already scanning')
      return true
    }

    if (!this.adapterReady) {
      const initialized = await this.initAdapter()
      if (!initialized) {
        console.error('[BeaconService] Adapter not ready')
        return false
      }
    }

    console.log('[BeaconService] Starting beacon scan...')

    return new Promise((resolve) => {
      const _this = this

      // 设置设备发现回调
      bluetooth.ondevicefound = function (data) {
        if (data && data.devices) {
          data.devices.forEach(device => {
            _this.handleDeviceFound(device)
          })
        }
      }

      // 开始扫描
      bluetooth.startDevicesDiscovery({
        allowDuplicatesKey: true, // 允许重复上报以更新 RSSI
        success: () => {
          console.log('[BeaconService] Scan started')
          _this.scanning = true
          resolve(true)
        },
        fail: (data, code) => {
          console.error('[BeaconService] Failed to start scan:', code)
          _this.handleError('启动扫描失败', code)
          resolve(false)
}
      })
    })
  }

  /**
   * 停止扫描
   */
  stopScanning() {
    if (!this.scanning) {
      return
    }

    console.log('[BeaconService] Stopping scan...')

    const _this = this
    bluetooth.stopDevicesDiscovery({
      success: () => {
        console.log('[BeaconService] Scan stopped')
        _this.scanning = false
      },
      fail: () => {
        _this.scanning = false
      }
    })
  }

  /**
   * 处理发现的设备
   * @param {Object} device - BLE 设备对象
   */
  handleDeviceFound(device) {
    const beacon = extractESP32BeaconFromDevice(device)

    if (!beacon) {
      return
    }

    const roomId = getRoomIdFromMajor(beacon.major, config.beacon.roomMapping)

    if (!roomId) {
      console.debug('[BeaconService] Beacon major not in mapping:', beacon.major)
      return
    }

    console.debug('[BeaconService] Found ESP32 Beacon:', {
      roomId,
      major: beacon.major,
      rssi: beacon.rssi,
      distance: beacon.distance
    })

    const effectiveThreshold = this.lastRssi > RSSI_THRESHOLD
      ? RSSI_THRESHOLD - RSSI_HYSTERESIS
      : RSSI_THRESHOLD

    const inRange = beacon.rssi >= effectiveThreshold

    if (inRange) {
      this.lastRssi = beacon.rssi

      if (this.currentRoomId !== roomId) {
        console.log('[BeaconService] Room changed:', this.currentRoomId, '->', roomId)
        this.currentRoomId = roomId
        this.currentBeacon = beacon
        this.notifyRoomChanged(roomId, beacon)
      }

      this.discoveredBeacons.set(device.deviceId, {
        beacon,
        roomId,
        lastSeen: Date.now()
      })

      this.notifyBeaconDiscovered({
        deviceId: device.deviceId,
        roomId,
        roomName: getRoomDisplayName(roomId),
        rssi: beacon.rssi,
        distance: beacon.distance
      })
    } else {
      this.discoveredBeacons.delete(device.deviceId)

      if (this.currentBeacon && beacon.major === this.currentBeacon.major) {
        this.lastRssi = beacon.rssi

        const hasValidBeacon = Array.from(this.discoveredBeacons.values())
          .some(info => info.roomId === this.currentRoomId && Date.now() - info.lastSeen < 5000)

        if (!hasValidBeacon) {
          console.log('[BeaconService] Lost current room beacon')
          this.currentRoomId = null
          this.currentBeacon = null
          this.notifyRoomChanged(null, null)
        }
      }
    }
  }

  /**
   * 通知房间变化
   * @param {string} roomId - 房间 ID
   * @param {Object} beacon - Beacon 信息
   */
  notifyRoomChanged(roomId, beacon) {
    if (this.onRoomChanged) {
      this.onRoomChanged({
        roomId,
        roomName: roomId ? getRoomDisplayName(roomId) : null,
        beacon
      })
    }
  }

  /**
   * 通知发现新 Beacon
   * @param {Object} info - Beacon 信息
   */
  notifyBeaconDiscovered(info) {
    if (this.onBeaconDiscovered) {
      this.onBeaconDiscovered(info)
    }
  }

  /**
   * 处理错误
   * @param {string} message - 错误消息
   * @param {number} code - 错误代码
   */
  handleError(message, code) {
    console.error('[BeaconService] Error:', message, code)

    if (this.onError) {
      this.onError({
        message,
        code
      })
    }
  }

  /**
   * 获取当前房间 ID
   * @returns {string|null} 当前房间 ID
   */
  getCurrentRoomId() {
    return this.currentRoomId
  }

  /**
   * 获取当前房间名称
   * @returns {string|null} 当前房间名称
   */
  getCurrentRoomName() {
    if (!this.currentRoomId) {
      return null
    }
    return getRoomDisplayName(this.currentRoomId)
  }

  /**
   * 获取所有发现的 Beacon
   * @returns {Array} Beacon 信息列表
   */
  getDiscoveredBeacons() {
    return Array.from(this.discoveredBeacons.values()).map(info => ({
      ...info,
      roomName: getRoomDisplayName(info.roomId)
    }))
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[BeaconService] Destroying...')

    this.stopScanning()

    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }

    // 取消事件监听
    bluetooth.onadapterstatechange = null
    bluetooth.ondevicefound = null

    // 关闭适配器
    bluetooth.closeAdapter({
      operateAdapter: false,
      success: () => {
        console.log('[BeaconService] Adapter closed')
      }
    })

    this.adapterReady = false
    this.discoveredBeacons.clear()
    this.currentRoomId = null
    this.currentBeacon = null
  }
}
