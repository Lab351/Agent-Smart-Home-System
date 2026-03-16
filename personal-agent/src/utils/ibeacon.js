/**
 * iBeacon 数据解析工具
 *
 * 用于解析 BLE 广播中的 iBeacon 格式数据
 */

/**
 * iBeacon 数据结构:
 * - Company ID: 2 bytes (0x004C = Apple)
 * - Beacon Type: 1 byte (0x02 = iBeacon)
 * - Data Length: 1 byte (0x15 = 21 bytes)
 * - UUID: 16 bytes
 * - Major: 2 bytes
 * - Minor: 2 bytes
 * - Tx Power: 1 byte
 */

const IBEACON_COMPANY_ID = 0x004c
const IBEACON_TYPE = 0x02
const IBEACON_DATA_LENGTH = 0x15

/**
 * 解析 iBeacon 广播数据
 * @param {ArrayBuffer} advertisData - BLE 广播数据
 * @returns {Object|null} iBeacon 信息对象
 */
export function parseIBeacon(advertisData) {
  if (!advertisData) {
    return null
  }

  const bytes = new Uint8Array(advertisData)

  // 查找 iBeacon 数据起始位置 (Company ID 0x004C)
  for (let offset = 0; offset < bytes.length - 24; offset++) {
    // 检查 Company ID (小端序)
    if (bytes[offset] === (IBEACON_COMPANY_ID & 0xFF) &&
        bytes[offset + 1] === (IBEACON_COMPANY_ID >> 8)) {

      // 检查 Beacon Type 和 Data Length
      if (bytes[offset + 2] === IBEACON_TYPE &&
          bytes[offset + 3] === IBEACON_DATA_LENGTH) {

        // 解析 UUID (16 bytes)
        const uuidBytes = bytes.slice(offset + 4, offset + 20)
        const uuid = bytesToUuid(uuidBytes)

        // 解析 Major (2 bytes, 大端序)
        const major = (bytes[offset + 20] << 8) | bytes[offset + 21]

        // 解析 Minor (2 bytes, 大端序)
        const minor = (bytes[offset + 22] << 8) | bytes[offset + 23]

        // 解析 Tx Power (1 byte, 有符号整数)
        const txPower = bytes[offset + 24]

        return {
          uuid,
          major,
          minor,
          txPower,
          rssi: null, // 需要从设备对象获取
          distance: null // 计算距离
        }
      }
    }
  }

  return null
}

/**
 * 将字节数组转换为 UUID 字符串
 * @param {Uint8Array} bytes - 16 字节的 UUID
 * @returns {string} UUID 字符串格式 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
function bytesToUuid(bytes) {
  if (bytes.length !== 16) {
    return ''
  }

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}

/**
 * 计算 RSSI 校准的距离（米）
 * 基于 Path Loss 模型: d = 10^((TxPower - RSSI) / (10 * n))
 * 其中 n 是路径损耗指数，通常取 2-4 之间
 * @param {number} txPower - 1米处的参考 RSSI (TxPower)
 * @param {number} rssi - 当前测量的 RSSI
 * @param {number} n - 路径损耗指数，默认 2
 * @returns {number} 估算的距离（米）
 */
export function calculateDistance(txPower, rssi, n = 2) {
  if (rssi === 0 || txPower === 0) {
    return -1
  }

  // 使用 Path Loss 模型计算距离
  const distance = Math.pow(10, (txPower - rssi) / (10 * n))

  return distance
}

/**
 * 判断 iBeacon 是否在有效范围内
 * @param {Object} beacon - iBeacon 对象
 * @param {number} rssiThreshold - RSSI 阈值（dBm）
 * @returns {boolean} 是否在范围内
 */
export function isBeaconInRange(beacon, rssiThreshold = -70) {
  if (!beacon || !beacon.rssi && beacon.rssi !== 0) {
    return false
  }

  return beacon.rssi >= rssiThreshold
}

/**
 * 从 BLE 设备对象中提取 iBeacon 信息
 * @param {Object} device - 快应用 BLE 设备对象
 * @param {string} targetUuid - 目标 UUID（可选）
 * @returns {Object|null} 解析后的 iBeacon 信息
 */
export function extractBeaconFromDevice(device, targetUuid) {
  if (!device || !device.advertisData) {
    return null
  }

  const beacon = parseIBeacon(device.advertisData)

  if (!beacon) {
    return null
  }

  // 添加 RSSI 信息
  beacon.rssi = device.rssi || 0
  beacon.deviceId = device.deviceId

  // 计算距离
  if (beacon.txPower !== 0 && beacon.rssi !== 0) {
    beacon.distance = calculateDistance(beacon.txPower, beacon.rssi)
  }

  // 过滤目标 UUID
  if (targetUuid && beacon.uuid !== targetUuid) {
    return null
  }

  return beacon
}

/**
 * 根据 Major 值获取房间 ID
 * @param {Object} beacon - iBeacon 对象
 * @param {Object} roomMapping - 房间映射配置
 * @returns {string|null} 房间 ID
 */
export function getRoomIdFromBeacon(beacon, roomMapping) {
  if (!beacon || !roomMapping) {
    return null
  }

  return roomMapping[beacon.major] || null
}

/**
 * 获取房间显示名称
 * @param {string} roomId - 房间 ID
 * @returns {string} 房间显示名称
 */
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

export default {
  parseIBeacon,
  calculateDistance,
  isBeaconInRange,
  extractBeaconFromDevice,
  getRoomIdFromBeacon,
  getRoomDisplayName
}
