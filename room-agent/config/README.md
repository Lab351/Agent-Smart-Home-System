### 关于提供商配置

`room-agent/config/settings.py` 当前会额外解析一份 LLM 配置文件，默认路径是 `room-agent/config/llm.example.yaml`，也可以通过 CLI 参数 `--llm-config` 显式指定其他路径。

这份配置只负责大模型集成信息，不再放在 `room-agent/config.py` 里。

安全说明：

- `room-agent/tests/fixtures/*.yaml` 仅保留脱敏模板，不应提交真实 `api_key` / `auth_token`
- 做真实 smoke / 联调时，请复制模板到你自己的私有配置路径，再通过 CLI 参数传入

#### TLDR

LLM 配置采用两层结构：

- 第一层 `providers`：声明 provider、本身的 `base_url` / `api_key`，以及该 provider 下可用的模型。
- 第二层 `roles`：声明业务角色 `powerful` 和 `low_cost` 分别引用哪个 provider、哪个模型。

`llm_provider` 不负责自动帮业务选择模型。它只提供：

- 单模型 `ChatOpenAI`
- 一个可手工选择的 registry

业务层自己决定当前请求应该拿 `powerful` 还是 `low_cost`。

#### YAML 结构

示例文件结构如下：

```yaml
providers:
  dashscope:
    provider_type: openai_compatible
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: ""
    models:
      qwen_max:
        model_id: qwen-max
        sampling:
          temperature: 0.1
      qwen_plus:
        model_id: qwen-plus
        sampling:
          temperature: 0.2

roles:
  powerful:
    provider: dashscope
    model_key: qwen_max
  low_cost:
    provider: dashscope
    model_key: qwen_plus
```

几个关键点：

- `providers.<name>.models.<model_key>.model_id` 是真实传给上游 SDK 的模型 ID。
- `providers.<name>.models.<model_key>.sampling` 是该模型自己的采样参数。当前已解析 `temperature`。
- `roles` 只做引用，不重复定义模型细节。

#### 解析规则

`settings.py` 解析后会生成两个角色配置：

- `settings.llm.powerful`
- `settings.llm.low_cost`

如果 YAML 里只配置了一个角色，解析器会自动回退，让两个入口都指向同一个配置，避免业务侧因为缺一项直接拿不到模型实例。

#### 代码边界

- `room-agent/config/settings.py`：负责解析 `llm.example.yaml` 或外部指定路径。
- `room-agent/integrations/llm_provider.py`：负责把单个模型配置实例化成 `ChatOpenAI`，并提供 registry。
- `room-agent/app/main.py`：CLI 默认从 registry 中取 `low_cost`。

#### CLI 用法

使用测试 CLI 单次执行：

```bash
cd room-agent
.venv/bin/python app/test_cli.py "你好" \
  --config config/examples/room_agent.example.yaml \
  --llm-config /path/to/private-llm.yaml
```

或启动正式服务：

```bash
cd room-agent
uv run serve \
  --config-path config/examples/room_agent.example.yaml \
  --llm-config-path /path/to/private-llm.yaml
```

### 关于房间配置

3.18 对齐，现在房间配置还需要保留的字段包括

- agent 的基本配置，包括名字，id 等元数据，和原协议保持一致

```yaml
agent:
  id: "room-agent-1"
  room_id: "bedroom"
  version: "1.0.0"
```

- Home Assistant MCP 配置块，当前输入使用 `base_url`，运行时会自动拼成 `{base_url}/api/mcp` 作为 MCP endpoint。

```yaml
agent:
  home_assistant_mcp:
    enabled: true
    server_name: "home_assistant"
    transport: "streamable_http"
    base_url: "http://home-assistant.local:8123"
    auth_token: "YOUR_HA_TOKEN"
    health_check:
      enabled: true
```

- beacon 配置块，当前主要用于声明房间与物理 Beacon 的绑定关系，以及生成 ESP32 固件参数。这一项同样和原协议保持一致。

这个配置和服务 runtime 无关，只用来生成 beacon 固件代码。

```yaml
# BLE Beacon配置（空间感知层）
beacon:
  enabled: true # 是否启用BLE Beacon广播
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF" # 系统统一UUID
  major: 2 # Room identifier (2=卧室, 1=客厅, 3=书房...)
  minor: 0 # Zone/Position in room (0-65535)
  measured_power: -59 # Calibrated RSSI at 1 meter (-59 for standard beacon)
  interval: 1 # Broadcast interval in seconds
```

- 后端配置块，当前主要用于 Room Agent 启动后向 `qwen-backend` 注册 A2A 发现信息。

具体字段待定。至少要包括

- `url`: 后端地址
- `register_on_startup`: 是否启动时注册
- `heartbeat_interval`: 心跳间隔
- `agent_host`: Room Agent 对外服务地址。因为 qwen-backend 是一个 AI Gateway，会将请求转发回本服务。

参考配置

```yaml
gateway:
  url: "http://home-gateway.local" # Qwen Backend地址
  register_on_startup: true # 是否在启动时注册到后端
  heartbeat_interval: 60 # 心跳间隔，单位秒
  agent_host: "http://room-agent.local" # Room Agent对外服务地址
```

如果和外面根目录的 docs 有冲突，以本文档为准。

---

** 以下内容仅供参考，不是开发规范 **

> Codex 生成

`room-agent/config/` 目录下的配置，当前主要承担“房间身份声明”和“空间绑定配置源”两类职责。

#### TLDR

Room Agent 中的 Beacon 配置文件，本质上是房间空间绑定的配置源。它负责描述“这个 Room Agent 对应哪个 Beacon / 哪个房间”，并被用于 ESP32 参数生成、配置校验和后端映射登记，而不是当前运行时蓝牙发现的执行主体。

#### 1. Agent 基本身份

以 `room_agent.yaml` 为例，配置中的：

- `agent.id`
- `agent.room_id`
- `agent.version`

定义了当前 Room Agent 的身份。其中 `room_id` 是后续 MQTT topic、房间绑定和后端登记时的核心字段。

#### 2. Beacon 配置的真实作用

`beacon` 配置块的作用，不是让 Python 版 Room Agent 在运行时主动扫描蓝牙，也不是当前主链路下的广播执行体，而是用于声明“这个房间对应哪个物理 Beacon”。

关键字段包括：

- `uuid`: 系统级 Beacon UUID
- `major`: 房间编号
- `minor`: 房间内区域编号
- `measured_power`: RSSI 校准值
- `interval`: 广播间隔

其中最重要的是：

- `agent.room_id`
- `beacon.major`

这两个字段共同表达房间与 Beacon 的绑定关系。也就是说，这份配置本质上是 Room Agent 侧维护的空间绑定真值。

#### 3. Beacon 配置当前用于哪些地方

当前代码和文档里，这份 Beacon 配置主要有以下用途：

- 作为 Room Agent 与物理 Beacon 的绑定声明
- 作为生成 ESP32 Beacon 固件参数的输入
- 作为部署前一致性校验的输入
- 作为后续向 `qwen-backend` 注册 Beacon 映射时的来源数据

具体对应关系如下。

##### 3.1 生成 ESP32 Beacon 配置

脚本 `room-agent/scripts/generate_esp32_beacon.py` 会读取 `room_agent.yaml` 中的 `beacon` 配置，生成 ESP32 侧使用的广播数据和配置头文件。

这意味着 Room Agent 配置并不只是“文档用途”，它还直接参与物理 Beacon 的参数生成，目的是保证：

- ESP32 广播出去的房间编号和 Room Agent 的 `room_id` 一致
- UUID、功率、间隔等参数一致

##### 3.2 配置校验

脚本 `room-agent/scripts/validate_beacon_binding.py` 会校验：

- `room_id` 是否存在
- `beacon.major` 是否和 `room_id` 映射一致
- UUID 格式是否合法
- `minor`、`measured_power`、`interval` 是否在合理范围内

所以这份配置也是联调和部署前的验证依据。

##### 3.3 后端登记

设计上，Room Agent 启动后应基于这份配置，把：

- Beacon 标识
- 房间标识
- Agent 标识
- MQTT 访问信息

登记到 `qwen-backend` 的 Beacon Registry。

当前 `backend.url`、`register_on_startup`、`heartbeat_interval` 等字段就是为这条链路准备的。

#### 4. Beacon 配置当前不负责什么

需要和现有实现边界区分清楚：

- 蓝牙扫描由 Personal Agent 负责，不在 Room Agent 中完成
- 物理 Beacon 广播当前由 ESP32 负责，默认不是 Python Room Agent 直接广播
- mDNS 发现方案已废弃，因此这份配置当前不再承担 mDNS 服务发现角色

也就是说，当前主链路更接近：

1. ESP32 广播 Beacon
2. Personal Agent 扫描 Beacon 并识别房间
3. Personal Agent 通过 `qwen-backend` 查询该房间对应的 Room Agent
4. 双方通过 MQTT 完成交互

在这条链路里，`room-agent/config` 下的 Beacon 配置主要负责“定义绑定关系”，而不是承担运行时扫描或发现逻辑本身。
