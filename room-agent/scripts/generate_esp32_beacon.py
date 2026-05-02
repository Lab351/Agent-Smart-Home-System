#!/usr/bin/env python3
"""
ESP32 BLE Beacon配置代码生成器

根据Room Agent配置生成ESP32端的beacon配置代码
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import yaml
import datetime
from room_mapping import ROOM_NAMES


def generate_esp32_beacon_config(room_config_path: str) -> str:
    """生成ESP32 beacon配置代码（自定义厂商数据格式）

    Args:
        room_config_path: Room Agent配置文件路径

    Returns:
        str: 生成的C代码片段，可直接替换main.c中的raw_data数组
    """
    # 加载Room Agent配置
    config_path = Path(project_root) / room_config_path
    with open(config_path, 'r') as f:
        room_config = yaml.safe_load(f)

    # 提取beacon配置
    agent_config = room_config.get("agent", {})
    beacon_config = room_config.get("beacon", {})

    room_id = agent_config.get("room_id")
    room_name_cn = ROOM_NAMES.get(room_id, room_id)
    major = beacon_config.get("major")
    minor = beacon_config.get("minor", 0)  # 用作capability bitmap
    measured_power = beacon_config.get("measured_power", -59)

    # 生成设备名（用于nRF Connect可见性）
    # BLE设备名最长8字节，从room_id截取
    if len(room_id) > 8:
        device_name = room_id[:8].capitalize()
    else:
        device_name = room_id.capitalize()

    # 生成C代码片段（替换main.c中的adv_raw_data和scan_rsp_raw_data）
    code = f"""/*
 * ESP32 BLE Beacon Raw Data配置
 * 自动生成 - 基于: {room_config_path}
 * 房间: {room_name_cn} ({room_id})
 * Major: {major}
 * 生成时间: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
 *
 * 使用方法：
 * 1. 将下面的数组定义复制到 esp32-ble-beacon/main/main.c
 * 2. 替换原有的 adv_raw_data[] 和 scan_rsp_raw_data[] 数组
 * 3. 重新编译并烧录ESP32
 */

// ========== Advertising Raw Data ==========
static uint8_t adv_raw_data[] = {{
    // Flags (3字节)
    0x02, ESP_BLE_AD_TYPE_FLAG, 0x06,

    // Device Name (用于nRF Connect可见性)
    // Length: 1(type) + {len(device_name)}(name) = {len(device_name) + 1}
    0x{len(device_name) + 1:02X}, ESP_BLE_AD_TYPE_NAME_CMPL,
    {', '.join(f"'{c}'" for c in device_name)},

    // Manufacturer Specific Data (11字节)
    // Length: 1(type) + 2(company_id) + 1(beacon_type) + 1(version) + 4(agent_id) + 1(cap) + 1(status) = 11
    0x0B, ESP_BLE_AD_MANUFACTURER_SPECIFIC_TYPE,
    0xFF, 0xFF,                        // Company ID (private)
    0x01,                              // Beacon type: 0x01 = Room Agent
    0x01,                              // Protocol version
    // Agent ID (Major值，小端序uint32)
    0x{major & 0xFF:02X}, 0x{(major >> 8) & 0xFF:02X}, 0x{(major >> 16) & 0xFF:02X}, 0x{(major >> 24) & 0xFF:02X},
    // Capability bitmap (从minor读取)
    0x{minor & 0xFF:02X},
    // Agent status (0x00 = 正常)
    0x00,

    // TX Power (3字节)
    0x02, ESP_BLE_AD_TYPE_TX_PWR, 0x{measured_power & 0xFF:02X},
}};

// ========== Scan Response Raw Data ==========
static uint8_t scan_rsp_raw_data[] = {{
    // Device Address (8字节) - 会在运行时自动填充
    0x08, ESP_BLE_AD_TYPE_LE_DEV_ADDR,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,

    // URI (可选，用于nRF Connect测试)
    // URI_PREFIX_NONE = "" (空字符串)
    // 完整URI: //wskun.top
    // Length: 1(type) + 1(prefix) + len("//wskun.top") = 13
    0x0D, ESP_BLE_AD_TYPE_URI, URI_PREFIX_NONE,
    '/', '/', 'w', 's', 'k', 'u', 'n', '.', 't', 'o', 'p',
}};

/*
 * 配置说明：
 *
 * 1. adv_raw_data 包含：
 *    - Flags: 0x06 (General Discoverable + BR/EDR not supported)
 *    - Device Name: {device_name}
 *    - Manufacturer Data: 自定义厂商数据
 *      - Company ID: 0xFFFF (私有)
 *      - Beacon Type: 0x01 (Room Agent)
 *      - Protocol Version: 0x01
 *      - Agent ID: {major} (对应{room_name_cn})
 *      - Capability: 0x{minor:02X}
 *      - Status: 0x00 (正常)
 *    - TX Power: {measured_power} dBm
 *
 * 2. scan_rsp_raw_data 包含：
 *    - Device Address: 运行时自动填充ESP32的MAC地址
 *    - URI: /{room_id} (用于测试)
 *
 * 3. 广播间隔在 main.c 的 adv_params 中设置（默认20ms)
 */

"""

    return code


def generate_esp32_sdk_config(room_config_path: str) -> str:
    """生成ESP-IDF SDK配置文件

    Args:
        room_config_path: Room Agent配置文件路径

    Returns:
        str: sdkconfig.defaults内容
    """
    # 加载配置
    config_path = Path(project_root) / room_config_path
    with open(config_path, 'r') as f:
        room_config = yaml.safe_load(f)

    agent_config = room_config.get("agent", {})
    beacon_config = room_config.get("beacon", {})

    room_id = agent_config.get("room_id")
    major = beacon_config.get("major")

    config = f"""# ESP-IDF SDK配置文件
# 对应Room Agent配置: {room_config_path}

# 房间配置
CONFIG_ROOM_ID="{room_id}"
CONFIG_ROOM_MAJOR={major}
CONFIG_ROOM_MINOR={beacon_config.get('minor', 0)}

# BLE Beacon配置
CONFIG_BEACON_ENABLED=y
CONFIG_BEACON_INTERVAL={beacon_config.get('interval', 1)}

# WiFi配置（根据实际网络修改）
CONFIG_ESP_WIFI_SSID="YourWiFiSSID"
CONFIG_ESP_WIFI_PASSWORD="YourWiFiPassword"

# MQTT配置（可选：ESP32作为MQTT客户端）
CONFIG_MQTT_ENABLED=n
# CONFIG_MQTT_BROKER_URI="mqtt://192.168.1.100:1883"

# 日志级别
CONFIG_LOG_DEFAULT_LEVEL_INFO=1
"""

    return config


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(
        description="生成ESP32 BLE Beacon配置代码"
    )
    parser.add_argument(
        "--config",
        default="config/room_agent.yaml",
        help="Room Agent配置文件路径"
    )
    parser.add_argument(
        "--output",
        help="输出目录（默认：esp32_beacon_config/）"
    )
    parser.add_argument(
        "--type",
        choices=["header", "main", "sdkconfig", "all"],
        default="all",
        help="生成的代码类型"
    )

    args = parser.parse_args()

    # 确定输出目录
    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = Path(project_root) / "esp32_beacon_config"

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"📄 读取配置: {args.config}")
    print(f"📝 输出目录: {output_dir}")

    # 生成代码
    if args.type in ["header", "all"]:
        header_code = generate_esp32_beacon_config(args.config)
        header_path = output_dir / "esp32_beacon_config.h"
        with open(header_path, 'w') as f:
            f.write(header_code)
        print(f"✅ 生成头文件: {header_path}")

    # 不再生成main_beacon.c，因为用户只需要复制raw_data数组到esp32-ble-beacon项目

    if args.type in ["sdkconfig", "all"]:
        sdk_config = generate_esp32_sdk_config(args.config)
        sdk_path = output_dir / "sdkconfig.defaults"
        with open(sdk_path, 'w') as f:
            f.write(sdk_config)
        print(f"✅ 生成SDK配置: {sdk_path}")

    # 加载配置用于README生成
    config_path = Path(project_root) / args.config
    with open(config_path, 'r') as f:
        room_config = yaml.safe_load(f)

    agent_config = room_config.get("agent", {})
    beacon_config = room_config.get("beacon", {})

    room_id = agent_config.get("room_id")
    room_name_cn = ROOM_NAMES.get(room_id, room_id)
    major = beacon_config.get("major")
    minor = beacon_config.get("minor", 0)
    measured_power = beacon_config.get("measured_power", -59)

    # 生成README
    readme_content = f"""# ESP32 BLE Beacon配置文件

## 生成时间
{datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 对应Room Agent配置
{args.config}

## 文件说明

### esp32_beacon_config.h
包含自定义厂商数据格式的`raw_data`数组定义：
- `adv_raw_data[]` - 广播数据数组
- `scan_rsp_raw_data[]` - 扫描响应数据数组

## 使用方法

### 步骤1: 复制数组到ESP32项目

打开 `esp32_beacon_config.h`，复制其中的两个数组：
- `adv_raw_data[]`
- `scan_rsp_raw_data[]`

粘贴到 `esp32-ble-beacon/main/main.c`，替换原有的同名数组。

### 步骤2: 编译ESP32项目

```bash
cd /path/to/esp32-ble-beacon

# 清理之前的编译
idf.py fullclean

# 配置项目
idf.py reconfigure

# 编译
idf.py build
```

### 步骤3: 烧录到ESP32

```bash
# 烧录（根据实际端口修改）
idf.py -p /dev/ttyUSB0 flash

# 监视串口（可选）
idf.py -p /dev/ttyUSB0 monitor
```

## 验证Beacon

使用BLE扫描工具验证：

### 使用nRF Connect（手机App）
1. 打开nRF Connect
2. 扫描设备
3. 找到名称为 "{room_id.capitalize()}" 的设备
4. 查看厂商数据：
   - Company ID: 0xFFFF
   - Beacon Type: 0x01
   - Agent ID: {major}

### 使用命令行（Linux）
```bash
hcitool lescan
```

### 使用命令行（macOS）
```bash
bleutil scan
```

## 配置详情

### Beacon数据格式
- **Company ID**: 0xFFFF (私有)
- **Beacon Type**: 0x01 (Room Agent)
- **Protocol Version**: 0x01
- **Agent ID**: {major} (对应{room_name_cn})
- **Capability**: 0x{minor:02X}
- **Status**: 0x00 (正常)
- **TX Power**: {measured_power} dBm

### 联动Room Agent

1. 确保Room Agent配置文件正确
2. 运行验证脚本：
   ```bash
   python3 scripts/validate_beacon_binding.py --config {args.config}
   ```
3. 启动Room Agent：
   ```bash
   python3 main_room_agent.py
   ```

## 故障排查

### 问题：扫描不到beacon
1. 检查ESP32供电
2. 检查ESP32固件是否正常运行
3. 使用串口监视查看ESP32日志

### 问题：Agent ID不匹配
1. 检查生成的`adv_raw_data`中的Agent ID
2. 检查Room Agent的`beacon.major`值
3. 运行验证脚本

### 问题：RSSI信号弱
1. 调整`measured_power`校准值
2. 减少beacon与接收器距离
3. 检查ESP32发射功率设置
"""

    readme_path = output_dir / "README.md"
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(readme_content)
    print(f"✅ 生成README: {readme_path}")

    print(f"\n✅ 配置文件生成完成！")
    print(f"📁 输出目录: {output_dir.absolute()}")
    print(f"\n下一步：")
    print(f"  1. 查看README: {readme_path}")
    print(f"  2. 复制文件到ESP32项目")
    print(f"  3. 编译并烧录ESP32")
    print(f"  4. 验证beacon信号")
    print(f"  5. 运行验证脚本：python3 scripts/validate_beacon_binding.py")


if __name__ == "__main__":
    import datetime
    sys.exit(main())
