# ESP32 BLE Beacon配置文件

## 生成时间
2026-02-28 23:28:16

## 对应Room Agent配置
config/room_agent.yaml

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
3. 找到名称为 "Bedroom" 的设备
4. 查看厂商数据：
   - Company ID: 0xFFFF
   - Beacon Type: 0x01
   - Agent ID: 2

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
- **Agent ID**: 2 (对应卧室)
- **Capability**: 0x00
- **Status**: 0x00 (正常)
- **TX Power**: -59 dBm

### 联动Room Agent

1. 确保Room Agent配置文件正确
2. 运行验证脚本：
   ```bash
   python3 scripts/validate_beacon_binding.py --config config/room_agent.yaml
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
