/*
 * ESP32 BLE Beacon Raw Data配置
 * 自动生成 - 基于: config/room_agent.yaml
 * 房间: 卧室 (bedroom)
 * Major: 2
 * 生成时间: 2026-02-28 23:28:16
 *
 * 使用方法：
 * 1. 将下面的数组定义复制到 esp32-ble-beacon/main/main.c
 * 2. 替换原有的 adv_raw_data[] 和 scan_rsp_raw_data[] 数组
 * 3. 重新编译并烧录ESP32
 */

// ========== Advertising Raw Data ==========
static uint8_t adv_raw_data[] = {
    // Flags (3字节)
    0x02, ESP_BLE_AD_TYPE_FLAG, 0x06,

    // Device Name (用于nRF Connect可见性)
    // Length: 1(type) + 7(name) = 8
    0x08, ESP_BLE_AD_TYPE_NAME_CMPL,
    'B', 'e', 'd', 'r', 'o', 'o', 'm',

    // Manufacturer Specific Data (11字节)
    // Length: 1(type) + 2(company_id) + 1(beacon_type) + 1(version) + 4(agent_id) + 1(cap) + 1(status) = 11
    0x0B, ESP_BLE_AD_MANUFACTURER_SPECIFIC_TYPE,
    0xFF, 0xFF,                        // Company ID (private)
    0x01,                              // Beacon type: 0x01 = Room Agent
    0x01,                              // Protocol version
    // Agent ID (Major值，小端序uint32)
    0x02, 0x00, 0x00, 0x00,
    // Capability bitmap (从minor读取)
    0x00,
    // Agent status (0x00 = 正常)
    0x00,

    // TX Power (3字节)
    0x02, ESP_BLE_AD_TYPE_TX_PWR, 0xC5,
};

// ========== Scan Response Raw Data ==========
static uint8_t scan_rsp_raw_data[] = {
    // Device Address (8字节) - 会在运行时自动填充
    0x08, ESP_BLE_AD_TYPE_LE_DEV_ADDR,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,

    // URI (可选，用于nRF Connect测试)
    // URI_PREFIX_NONE = "" (空字符串)
    // 完整URI: //wskun.top
    // Length: 1(type) + 1(prefix) + len("//wskun.top") = 13
    0x0D, ESP_BLE_AD_TYPE_URI, URI_PREFIX_NONE,
    '/', '/', 'w', 's', 'k', 'u', 'n', '.', 't', 'o', 'p',
};

/*
 * 配置说明：
 *
 * 1. adv_raw_data 包含：
 *    - Flags: 0x06 (General Discoverable + BR/EDR not supported)
 *    - Device Name: Bedroom
 *    - Manufacturer Data: 自定义厂商数据
 *      - Company ID: 0xFFFF (私有)
 *      - Beacon Type: 0x01 (Room Agent)
 *      - Protocol Version: 0x01
 *      - Agent ID: 2 (对应卧室)
 *      - Capability: 0x00
 *      - Status: 0x00 (正常)
 *    - TX Power: -59 dBm
 *
 * 2. scan_rsp_raw_data 包含：
 *    - Device Address: 运行时自动填充ESP32的MAC地址
 *    - URI: /bedroom (用于测试)
 *
 * 3. 广播间隔在 main.c 的 adv_params 中设置（默认20ms)
 */

