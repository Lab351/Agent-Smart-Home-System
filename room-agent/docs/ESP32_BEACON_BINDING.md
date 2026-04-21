# ESP32 BLE Beacon 与 Room Agent 绑定方案

## 概述

当前空间发现链路使用 ESP32 自定义 BLE manufacturer data。ESP32 只负责广播房间编号，
Personal Agent 扫描后将 `major` 转成字符串作为 `beacon_id` 查询 qwen-backend，
Room Agent 启动时向 qwen-backend 注册同一个 `beacon_id`。

## 运行链路

```text
ESP32 BLE Beacon
  -> 广播 manufacturer data: company_id + beacon_type + version + major + capability + status
Personal Agent
  -> 解析 major，并生成 beacon_id = String(major)
qwen-backend
  -> GET /api/beacon/:beacon_id 返回 room_id、agent_id 和 A2A 发现信息
Room Agent
  -> 启动时 POST /api/beacon/register 注册 beacon_id -> room_id -> agent_id
```

## 绑定字段

| 字段 | 来源 | 用途 |
|---|---|---|
| `beacon.beacon_id` | Room Agent 配置 | qwen-backend 中登记的 Beacon 唯一标识 |
| `beacon.major` | Room Agent 配置和 ESP32 广播 | 房间编号；Personal Agent 当前用 `String(major)` 作为 `beacon_id` |
| `beacon.minor` | Room Agent 配置和 ESP32 广播 | capability bitmap 或房间内区域扩展位 |
| `agent.room_id` | Room Agent 配置 | 后端返回给 Personal Agent 的房间标识 |
| `agent.id` | Room Agent 配置 | 后端返回给 Personal Agent 的 Room Agent 标识 |

当前必须保持：

```text
beacon.beacon_id == String(beacon.major)
```

例如卧室 `major=2` 时，Room Agent 配置中应写 `beacon_id: "2"`。

## 房间映射

以 `room-agent/room_mapping.py` 为准：

| 房间 | `room_id` | `major` | `beacon_id` |
|---|---|---:|---|
| 客厅 | `livingroom` | 1 | `"1"` |
| 卧室 | `bedroom` | 2 | `"2"` |
| 厨房 | `kitchen` | 3 | `"3"` |
| 浴室 | `bathroom` | 4 | `"4"` |
| 书房 | `study` | 5 | `"5"` |
| 阳台 | `balcony` | 6 | `"6"` |
| 车库 | `garage` | 7 | `"7"` |

## ESP32 广播格式

ESP32 广播使用自定义 manufacturer data：

```text
Byte 0-1: company_id, 当前为 0xffff
Byte 2:   beacon_type, 0x01 表示 Room Agent Beacon
Byte 3:   protocol version
Byte 4-7: major，uint32 little-endian
Byte 8:   capability bitmap
Byte 9:   status
```

卧室示例中，`major=2` 应编码为：

```c
0x02, 0x00, 0x00, 0x00,
```

## Room Agent 配置示例

```yaml
agent:
  id: "room-agent-bedroom"
  room_id: "bedroom"
  version: "1.0.0"

gateway:
  url: "http://8.134.13.1:3088"
  register_on_startup: true
  heartbeat_interval: 60
  # agent_host 可省略，Room Agent 会自动检测当前局域网 IP 并注册
  # agent_host: "http://<Jetson可被访问的IP>:10000"

beacon:
  enabled: true
  beacon_id: "2"
  major: 2
  minor: 0
  measured_power: -59
  interval: 1
```

## 校验与生成

生成 ESP32 广播数组：

```bash
cd room-agent
python3 scripts/generate_esp32_beacon.py --config config/examples/room_agent.yaml
```

校验 Room Agent 配置和房间映射：

```bash
cd room-agent
python3 scripts/validate_beacon_binding.py --config config/examples/room_agent.yaml
```

校验重点：

- `agent.room_id` 必须在房间映射表中存在。
- `beacon.major` 必须与 `agent.room_id` 的映射一致。
- `beacon.beacon_id` 必须与 Personal Agent 扫描端生成的 ID 一致，当前为 `String(major)`。
- `beacon.minor`、`measured_power`、`interval` 必须在合理范围内。

## 部署检查

ESP32 侧：

- 确认广播 manufacturer data 的 `major` 与房间一致。
- 确认广播数据中的 company id 为 `0xffff`，beacon type 为 `0x01`。
- 确认 `measured_power` 与配置一致。
- 使用 nRF Connect 等工具确认设备可扫描。

Room Agent 侧：

- `beacon.beacon_id` 等于 `String(beacon.major)`。
- `gateway.url` 指向 qwen-backend。
- `ROOM_AGENT_HOST=0.0.0.0` 让 A2A 服务监听局域网网卡；`gateway.agent_host` 仅在固定域名、反向代理、隧道或静态 IP 部署时手动填写。
- 启动后确认 qwen-backend 的 `/api/beacon/:beacon_id` 能查到 `room_id` 和 `agent_id`。

Personal Agent 侧：

- 确认扫描端能够解析 ESP32 manufacturer data。
- 确认扫描端用 `String(major)` 访问 `/api/beacon/:beacon_id`。
- 确认 RSSI 阈值适合实际房间距离。
