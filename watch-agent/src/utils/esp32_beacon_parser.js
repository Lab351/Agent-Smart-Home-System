/**
 * ESP32 BLE Beacon 解析器
 * 
 * 解析 ESP32 自定义厂商数据格式
 * 广播数据结构:
 * - Flags: [len=2][0x01][flags] (固定3字节)
 * - Device Name: [len][0x09][name...] (长度可变)
 * - Manufacturer Data: [len][0xFF][companyId(2)][beaconType][version][major(4)][capability][status]
 */

/**
 * 解析 ESP32 Beacon 广播数据
 * @param {Array|Uint8Array} advertisData - 完整广播数据
 * @returns {Object|null} 解析后的 Beacon 数据
 */
export function parseESP32Beacon(advertisData) {
  if (!advertisData || advertisData.length < 10) {
    return null
  }

  const data = new Uint8Array(advertisData)
  
  let offset = 0
  
  const companyId = data[offset] | (data[offset + 1] << 8)
  if (companyId !== 0xFFFF) {
    return null
  }

  const beaconType = data[offset + 2]
  if (beaconType !== 0x01) {
    return null
  }

  return {
    companyId,
    beaconType,
    version: data[offset + 3],
    major: data[offset + 4] | (data[offset + 5] << 8) | 
           (data[offset + 6] << 16) | (data[offset + 7] << 24),
    capability: data[offset + 8],
    status: data[offset + 9]
  }
}

/**
 * 从 Major 值获取房间 ID
 * @param {number} major - Beacon Major 值
 * @param {Object} roomMapping - 房间映射表
 * @returns {string|null} 房间 ID
 */
export function getRoomIdFromMajor(major, roomMapping) {
  return roomMapping[major] || null
}

export function getRoomDisplayName(roomId) {
  const roomNames = {
    'livingroom': '客厅',
    'bedroom': '卧室',
    'study': '书房',
    'kitchen': '厨房',
    'bathroom': '浴室'
  }
  return roomNames[roomId] || roomId
}

/**
 * 从 BLE 广播数据中提取 ESP32 Beacon 信息
 * @param {Object} device - BLE 设备对象
 * @returns {Object|null} ESP32 Beacon 信息
 */
export function extractESP32BeaconFromDevice(device) {
  if (!device || !device.advertisData) {
    return null
  }

  const beaconData = parseESP32Beacon(device.advertisData)
  
  if (!beaconData) {
    return null
  }
  
  return {
    deviceId: device.deviceId,
    rssi: device.RSSI,
    ...beaconData,
    distance: rssiToDistance(device.RSSI)
  }
}

/**
 * RSSI 转距离估算（简单模型）
 * @param {number} rssi - 信号强度
 * @param {number} txPower - 发射功率（默认 -59 dBm）
 * @returns {number} 估算距离（米）
 */
function rssiToDistance(rssi, txPower = -59) {
  if (rssi === 0) {
    return -1.0
  }
  
  const ratio = rssi / txPower
  if (ratio < 1.0) {
    return Math.pow(ratio, 10)
  } else {
    return 0.89976 * Math.pow(ratio, 7.7095) + 0.111
  }
}