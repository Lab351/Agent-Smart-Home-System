# HomeSystemAgent A2A (Agent-to-Agent) Specification

## 1. System Overview

### 1.1 Vision Statement
Build a spatially scoped, decentralized multi-agent communication architecture for smart home environments, where BLE enables proximity-based space binding, the qwen-backend Beacon Registry API supports in-space agent discovery, and MQTT provides structured semantic interaction among agents. A Central Agent maintains global consistency and policy coordination without breaking local autonomy, enabling scalable and robust home intelligence.

### 1.2 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Smart Home Space                                │
│                                                                          │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐       │
│  │   Personal  │         │   Room      │         │   Robot     │       │
│  │   Agent     │◄────────┤   Agent     │◄────────┤   Agent     │       │
│  │  (Watch/    │  MQTT   │  (Edge      │  MQTT   │  (Mobile    │       │
│  │   Phone)    │         │   Device)   │         │   Device)   │       │
│  └──────┬──────┘         └──────┬──────┘         └─────────────┘       │
│         │         ▲             │                       │               │
│         │         │             │                       │               │
│         │    MQTT (Policy &    │                       │               │
│         │         Arbitration)  │                       │               │
│         │         │             │                       │               │
│         │    ┌────▼─────┐      │                       │               │
│         │    │  Central │      │                       │               │
│         │    │  Agent   │      │                       │               │
│         │    │(Global   │      │                       │               │
│         │    │ Coordinator)│    │                       │               │
│         │    └──────────┘      │                       │               │
│         │                        │                       │               │
│         │ BLE Beacon             │ MQTT Broker           │               │
│         │                        │ (Local)               │               │
│         ▼                        ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Space Layer                                   │    │
│  │  BLE Beacon ───────► Spatial Binding ───────► Beacon Registry API│    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Agent Types & Roles

### 2.1 Personal Agent (随身 Agent)

**Deployment**: Smart watch, smartphone, wearable devices

**Responsibilities**:
- User intent parsing and natural language understanding
- Spatial localization via BLE beacon scanning
- Triggering interactions with current space agents
- User interface and feedback presentation

**Key Capabilities**:
```yaml
capabilities:
  - beacon_scanning:
      rssi_threshold: -70
      hysteresis: 5
      scan_interval: 1s
  - intent_recognition:
      wake_word: true
      voice_command: true
  - mqtt_client:
      qos: 1
      keep_alive: 60s
      auto_reconnect: true
```

### 2.2 Room Agent (房间 Agent)

**Deployment**: Edge devices (Jetson, Raspberry Pi, smart home hub)

**Responsibilities**:
- Spatial semantic management
- Device abstraction and control
- MQTT Broker management (space-scoped)
- Agent discovery coordination

**Key Capabilities**:
```yaml
capabilities:
  - mqtt_broker:
      port: 1883
      ws_port: 9001
      max_connections: 100
      qos: [0, 1, 2]
  - device_management:
      supported_protocols: [HTTP, MQTT, CoAP, Zigbee]
      device_discovery: true
  - beacon_registry_client:
      base_url: "http://qwen-backend:3000"
      register_path: "/api/beacon/register"
      heartbeat_path: "/api/beacon/{beacon_id}/heartbeat"
```

### 2.3 Robot Agent (机器人 Agent)

**Deployment**: Mobile robots, vacuum cleaners, delivery robots

**Responsibilities**:
- Task execution within room space
- State reporting via MQTT
- Navigation and obstacle avoidance (if applicable)

**Key Capabilities**:
```yaml
capabilities:
  - mqtt_client:
      subscriptions:
        - "room/{room_id}/robot/{robot_id}/control"
      publications:
        - "room/{room_id}/robot/{robot_id}/state"
        - "room/{room_id}/robot/{robot_id}/telemetry"
  - task_execution:
      task_types: [cleaning, delivery, patrol]
      status_reporting: true
```

### 2.4 Central Agent (中央 Agent)

**Deployment**: Home central node (NAS, Mini PC, Jetson), or cloud instance (optional)

**Responsibilities**:
- Global state modeling (home mode, user presence, risk state)
- Policy and rule management (declarative, global constraints)
- Cross-agent conflict arbitration (multi-user conflicts, rule violations)
- System-level event handling (security, mode switching)

**Key Capabilities**:
```yaml
capabilities:
  - global_state_management:
      state_types:
        - home_mode  # home/away/sleep/vacation
        - active_users
        - risk_level
      update_frequency: low
      subscribable: true

  - policy_management:
      rule_type: declarative
      examples:
        - sleep_mode_energy_saving
        - away_mode_automation
        - safety_priority_rules

  - conflict_arbitration:
      triggers:
        - multi_user_conflict
        - global_violation
      outputs:
        - accept/reject/degrade
        - reason_explanation
        - alternative_suggestion

  - event_broadcasting:
      events: [security, mode_switch]
      no_direct_control: true
```

**Design Principles**:
- Logical centralization, decentralized execution
- Soft constraints over hard control
- Event-driven, not polling
- Default non-intervention, intervene only when necessary
- Rules > State > Behavior

**Responsibility Boundaries**:
- **Must do**: Global state, policies, conflict resolution, cross-space consistency
- **Must NOT do**: User intent understanding, beacon sensing, device control, room-level decision

## 3. Communication Protocol Stack

### 3.1 Layer 1: Spatial Awareness (空间感知层)

**Purpose**: Answer "Which room am I in?"

**Technology**: BLE Beacon

**Beacon Specification**:
```yaml
beacon_format:
  uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # System-specific UUID
  major: 0-65535                                 # Room identifier
  minor: 0-65535                                 # Zone/Position in room
  measured_power: -59                            # Calibrated RSSI at 1m
```

**Spatial Binding Algorithm**:
```python
# Pseudo-code for spatial determination
def determine_current_space(beacons):
    """
    Input: List of detected beacons with RSSI values
    Output: Current space ID

    Algorithm:
    1. Filter beacons with RSSI > threshold (e.g., -70dBm)
    2. Select beacon with highest RSSI
    3. Apply hysteresis to prevent rapid switching:
       - Only switch if new beacon RSSI > current beacon RSSI + hysteresis
    """
    filtered = [b for b in beacons if b.rssi > RSSI_THRESHOLD]
    if not filtered:
        return UNKNOWN_SPACE

    candidate = max(filtered, key=lambda b: b.rssi)

    if current_space:
        if candidate.rssi > current_beacon.rssi + HYSTERESIS:
            return candidate.space_id
        else:
            return current_space
    else:
        return candidate.space_id
```

**Key Parameters**:
| Parameter | Value | Description |
|-----------|-------|-------------|
| RSSI Threshold | -70 dBm | Minimum signal to consider beacon valid |
| Hysteresis | 5 dB | Margin to prevent oscillation |
| Scan Interval | 1 second | Frequency of beacon scans |

### 3.2 Layer 2: In-Space Discovery (空间内发现层)

**Purpose**: Answer "Which agents are in this space?"

**Technology**: Beacon Registry API (qwen-backend)

**API Response Example**:
```json
{
  "success": true,
  "data": {
    "beacon_id": "01234567-89ab-cdef-0123456789abcdef-2-0",
    "room_id": "bedroom",
    "agent_id": "room-agent-bedroom",
    "mqtt_broker": "192.168.1.100",
    "mqtt_ws_port": 9001,
    "capabilities": ["light", "curtain", "climate"]
  }
}
```

**Discovery Flow**:
```python
# Personal Agent discovery logic
async def discover_room_agent(beacon_id):
    """
    1. Query Beacon Registry API by beacon_id
    2. Return MQTT broker connection details
    """
    info = await http.get(f"/api/beacon/{beacon_id}")
    if not info.get("success"):
        raise RoomAgentNotFound(f"No Room Agent found for {beacon_id}")

    data = info["data"]
    return {
        "host": data["mqtt_broker"],
        "mqtt_port": int(data.get("mqtt_port", 1883)),
        "agent_id": data["agent_id"],
        "capabilities": data.get("capabilities", [])
    }
```

### 3.3 Layer 3: Agent Communication (智能体通信层)

**Purpose**: Answer "How do agents exchange semantic information?"

**Technology**: MQTT (Message Queuing Telemetry Transport)

**Broker Topology**:
- **Decentralized**: Each room has its own MQTT broker
- **Space-scoped**: No cross-room communication by default
- **Local network**: Brokers run on LAN, not accessible from internet

**Topic Hierarchy**:
```
room/{room_id}/
├── agent/{agent_id}/
│   ├── control/          # Command topic
│   ├── state/            # State publication topic
│   ├── describe/         # Agent capability query
│   ├── description/      # Agent capability response
│   └── heartbeat/        # Liveness indicator
├── robot/{robot_id}/
│   ├── control/
│   ├── state/
│   └── telemetry/
└── system/
    ├── discovery/
    └── error/

home/
├── state/                # Global state (mode, users, risk)
├── policy/               # Policy updates
├── arbitration/          # Conflict resolution
├── events/               # System-level events
└── heartbeat/            # Central Agent liveness
```

**QoS Strategy**:
| Topic Type | QoS Level | Rationale |
|------------|-----------|-----------|
| control | 1 (At least once) | Commands must not be lost |
| state | 0 (At most once) | Latest state is sufficient |
| describe | 1 (At least once) | Must receive response |
| heartbeat | 0 (At most once) | Periodic updates, latest sufficient |
| telemetry | 0 (At most once) | High-frequency data |
| home/state | 0 (At most once) | Global state, latest sufficient |
| home/policy | 1 (At least once) | Policy updates must not be lost |
| home/arbitration | 1 (At least once) | Critical decisions must be delivered |
| home/events | 1 (At least once) | System events must not be missed |

## 4. Message Formats

### 4.1 Control Message

**Topic**: `room/{room_id}/agent/{agent_id}/control`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "personal-agent-user1",
  "target_device": "light_1",
  "action": "on",
  "parameters": {
    "brightness": 80,
    "color_temp": 4000
  },
  "correlation_id": "optional-correlation-id"
}
```

### 4.2 State Message

**Topic**: `room/{room_id}/agent/{agent_id}/state`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "agent_id": "room-agent-1",
  "devices": [
    {
      "device_id": "light_1",
      "state": "on",
      "attributes": {
        "brightness": 80,
        "color_temp": 4000
      }
    }
  ],
  "agent_status": "operational"
}
```

### 4.3 Describe Request

**Topic**: `room/{room_id}/agent/{agent_id}/describe`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "personal-agent-user1",
  "query_type": "capabilities"
}
```

### 4.4 Description Response

**Topic**: `room/{room_id}/agent/{agent_id}/description`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "agent_id": "room-agent-1",
  "agent_type": "room",
  "version": "1.0.0",
  "devices": [
    {
      "id": "light_1",
      "name": "Main Ceiling Light",
      "type": "light",
      "actions": ["on", "off", "set_brightness", "set_color_temp"],
      "state_attributes": ["brightness", "color_temp", "power_state"]
    },
    {
      "id": "curtain",
      "name": "Window Curtain",
      "type": "curtain",
      "actions": ["open", "close", "set_position"],
      "state_attributes": ["position", "state"]
    }
  ],
  "capabilities": ["device_control", "scene_activation"]
}
```

### 4.5 Heartbeat Message

**Topic**: `room/{room_id}/agent/{agent_id}/heartbeat`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "agent_id": "room-agent-1",
  "status": "operational",
  "uptime_seconds": 3600,
  "metrics": {
    "cpu_usage": 25.5,
    "memory_usage": 45.2,
    "active_connections": 3
  }
}
```

### 4.6 Global State Message (Central Agent)

**Topic**: `home/state`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "home_mode": "home",
  "active_users": ["user1", "user2"],
  "risk_level": "normal",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

### 4.7 Policy Update Message (Central Agent)

**Topic**: `home/policy`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "policy_name": "sleep_mode",
  "rules": {
    "light_max": "low",
    "noise_max": "minimum",
    "interruptible": false
  },
  "effective_from": "2024-01-15T22:00:00Z",
  "effective_until": "2024-01-16T07:00:00Z"
}
```

### 4.8 Arbitration Request Message

**Topic**: `home/arbitration`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "requesting_agent": "personal-agent-user1",
  "conflicting_agents": ["personal-agent-user2"],
  "conflict_type": "multi_user_intent",
  "intent": {
    "target_device": "light_1",
    "action": "on"
  },
  "context": {
    "room_id": "bedroom",
    "current_mode": "sleep"
  }
}
```

### 4.9 Arbitration Response Message (Central Agent)

**Topic**: `home/arbitration`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "request_id": "uuid-v4",
  "decision": "partial_accept",
  "reason": "sleep_mode_active",
  "suggestion": "delay_execution",
  "modified_action": {
    "target_device": "light_1",
    "action": "on",
    "parameters": {
      "brightness": 20
    }
  }
}
```

### 4.10 System Event Message (Central Agent)

**Topic**: `home/events`

**Format**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "event_type": "mode_switch",
  "event_data": {
    "from_mode": "home",
    "to_mode": "sleep",
    "triggered_by": "schedule",
    "effective_immediately": true
  }
}
```

## 5. Complete Communication Flow

### 5.1 Full Sequence Diagram

```
Personal Agent                    Room Agent                     Central Agent
     │                                 │                               │
     │◄────── BLE Beacon (RSSI) ───────┤                               │
     │                                 │                               │
     │  [Determine: Space=Bedroom]     │                               │
     │                                 │                               │
     │──── Beacon Registry Query ───────►│                               │
     │                                 │                               │
     │◄──── Beacon Registry Response ───┤                               │
     │  (IP: 192.168.1.100, Port:1883) │                               │
     │                                 │                               │
     │──── MQTT CONNECT ───────────────►│                               │
     │                                 │                               │
     │◄──── CONNACK ────────────────────┤                               │
     │                                 │                               │
     │─────────────────────────────────────────────────────────────────►│
     │           Subscribe: home/state, home/policy                     │
     │◄────────────────────────────────────────────────────────────────┤
     │           Global state: mode=home, users=[user1]                 │
     │                                 │                               │
     │──── Publish: /describe ─────────►│                               │
     │                                 │                               │
     │◄──── Publish: /description ─────┤                               │
     │  (Available devices/capabilities)                               │
     │                                 │                               │
     │──── Publish: /control ─────────►│                               │
     │  (Action: "curtain.close")      │                               │
     │                                 │                               │
     │                                 │──── Publish: /control ──────►│
     │                                 │  (Task assignment)           │
     │                                 │                               │
     │◄──── Publish: /state ───────────┤◄─── Publish: /state ─────────┤
     │  (State updates)                │  (Task status)               │
     │                                 │                               │
     │                                                                 │
     │  [Scenario: User tries to play music during sleep mode]         │
     │                                                                 │
     │──── Publish: /control ─────────►│                               │
     │  (Action: "music.play")         │                               │
     │                                 │─────── Publish: /arbitration►│
     │                                 │  (Request: music during sleep)│
     │                                 │◄────── Publish: /arbitration │
     │                                 │  (Response: reject, sleep_mode)│
     │◄──── Publish: /state ───────────┤                               │
     │  (Error: sleep_mode_active)     │                               │
     │                                 │                               │
```

### 5.2 Phase-by-Phase Breakdown

#### Phase 1: Spatial Binding (Connectionless)
```
Time: T0 to T1
Duration: Near-instantaneous

Events:
1. Beacon broadcasts (UUID, Major, Minor) continuously
2. Personal Agent scans beacons periodically
3. RSSI-based room determination with hysteresis

Output: current_space = "bedroom"
```

#### Phase 2: Agent Discovery
```
Time: T1 to T1 + ~100ms
Duration: < 1 second

Events:
1. Personal Agent calls Beacon Registry API
2. Receives broker address and agent metadata

Output: mqtt_broker = { host: "192.168.1.100", port: 1883 }
```

#### Phase 3: Connection Establishment
```
Time: T1 + 100ms to T1 + ~500ms
Duration: < 1 second

Events:
1. Personal Agent connects to MQTT broker
2. Subscribe to relevant topics
3. Publish describe request

Output: Connection established, capabilities known
```

#### Phase 4: Semantic Communication
```
Time: T1 + 500ms onwards
Duration: Ongoing

Events:
1. User triggers command
2. Personal Agent publishes control message
3. Room Agent processes and controls devices
4. State updates published

Output: Device state changes, user notified
```

## 6. Error Handling & Edge Cases

### 6.1 Beacon Unavailability
**Scenario**: No beacons detected or RSSI too weak

**Handling**:
```python
if no_beacons_detected:
    # Enter degraded mode
    status = "unknown_space"
    # Fallback to last known space (if recent)
    if last_known_space_timestamp < 5_minutes:
        current_space = last_known_space
        status = "estimated_space"
    else:
        current_space = None
        # Notify user: "Location unknown, please confirm room"
```

### 6.2 Room Agent Unreachable
**Scenario**: Beacon Registry API fails to resolve Room Agent

**Handling**:
```python
if room_agent_not_found:
    # Retry strategy
    retry_count = 0
    while retry_count < MAX_RETRIES:
        await asyncio.sleep(RETRY_DELAY)
        agent = await discover_room_agent(room_id)
        if agent:
            break
        retry_count += 1

    # Fallback options
    if not agent:
        # Option 1: Use cached connection details (if < 1 hour old)
        if cached_agent and cache_is_fresh:
            agent = cached_agent
            log.warning("Using cached Room Agent details")
        # Option 2: Direct IP configuration
        elif fallback_ip_configured:
            agent = fallback_config
            log.warning("Using fallback IP configuration")
        else:
            notify_user("Room Agent not found. Some features unavailable.")
```

### 6.3 MQTT Connection Lost
**Scenario**: Connection to MQTT broker drops

**Handling**:
```python
# Auto-reconnect with exponential backoff
reconnect_delay = 1  # Start with 1 second
max_delay = 60       # Cap at 60 seconds

while not connected:
    try:
        await mqtt_client.connect(broker_url)
        connected = True
        reconnect_delay = 1  # Reset on success
    except ConnectionError:
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, max_delay)
        log.warning(f"Reconnect failed, retrying in {reconnect_delay}s")
```

### 6.4 Device Control Failure
**Scenario**: Command sent but device doesn't respond

**Handling**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:05Z",
  "status": "failed",
  "error_code": "DEVICE_TIMEOUT",
  "error_message": "Device light_1 did not respond within 5s",
  "retry_suggested": true
}
```

## 7. Security Considerations

### 7.1 Authentication

**MQTT Authentication**:
```yaml
authentication:
  mechanism: "username_password"  # or client_certificates
  username_prefix: "agent_"
  password_format: "token_based"  # JWT or shared secret
  token_expiry: 86400  # 24 hours
```

### 7.2 Authorization

**Topic ACL**:
```yaml
access_control:
  personal_agent:
    can_publish:
      - "room/{room_id}/agent/*/control"
      - "room/{room_id}/agent/*/describe"
    can_subscribe:
      - "room/{room_id}/agent/*/state"
      - "room/{room_id}/agent/*/description"

  robot_agent:
    can_publish:
      - "room/{room_id}/robot/+/state"
      - "room/{room_id}/robot/+/telemetry"
    can_subscribe:
      - "room/{room_id}/robot/{self_id}/control"
```

### 7.3 Encryption

**Transport Security**:
```yaml
encryption:
  mqtt:
    tls_enabled: true  # Production
    tls_version: "1.3"
    certificate_validation: true
```

**⚠️ TO BE DEFINED**: Certificate management strategy (self-signed vs PKI)

### 7.4 Local Network Isolation

**Network Design**:
- MQTT brokers bind to LAN interface only (e.g., `192.168.x.x`)
- No port forwarding to internet
- VPN required for remote access (if needed)

## 8. Performance Requirements

### 8.1 Latency Targets

| Operation | Target Latency | Maximum Acceptable |
|-----------|----------------|-------------------|
| Spatial detection | < 1s | 3s |
| Beacon Registry discovery | < 200ms | 1s |
| MQTT connect | < 200ms | 1s |
| Control command | < 50ms (end-to-end) | 200ms |
| State update | < 100ms | 500ms |

### 8.2 Reliability Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| MQTT delivery success rate | > 99.9% | QoS 1/2 messages |
| Beacon Registry discovery success | > 99% | In stable LAN |
| Beacon detection accuracy | > 95% | Correct room identification |

### 8.3 Scalability Targets

| Metric | Target per Room | System-wide |
|--------|-----------------|-------------|
| Personal Agents | 10 | N/A (space-scoped) |
| Robot Agents | 5 | N/A |
| Devices per Room | 50 | N/A |
| MQTT Messages/sec | 100 | N/A |

## 9. State Management & Persistence

### 9.1 Room Agent State

**Persisted State**:
```yaml
room_agent_state:
  room_id: "bedroom"
  agent_id: "room-agent-1"
  registered_devices:
    - device_id: "light_1"
      last_seen: "2024-01-15T10:30:00Z"
      config: {...}
  active_agents:
    - agent_id: "personal-agent-user1"
      last_heartbeat: "2024-01-15T10:30:00Z"
  scenes:
    - name: "morning"
      devices_states: {...}
```

**⚠️ TO BE DEFINED**:
- State storage backend (SQLite? PostgreSQL?)
- State sync strategy (if multiple Room Agent instances)

### 9.2 Personal Agent State

**Persisted State**:
```yaml
personal_agent_state:
  user_id: "user1"
  current_space: "bedroom"
  space_history:
    - space: "bedroom"
      timestamp: "2024-01-15T10:30:00Z"
  known_room_agents:
    - room_id: "bedroom"
      agent_id: "room-agent-1"
      connection_params: {...}
      last_seen: "2024-01-15T10:29:00Z"
```

## 10. Configuration Management

### 10.1 Room Agent Configuration

**Config File**: `config/room_agent.yaml`
```yaml
agent:
  id: "room-agent-1"
  room_id: "bedroom"
  version: "1.0.0"

beacon:
  uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  major: 1  # Room identifier

mqtt:
  broker:
    port: 1883
    ws_port: 9001
    max_connections: 100
  qos_default: 1

beacon_registry:
  base_url: "http://qwen-backend:3000"
  register_path: "/api/beacon/register"
  heartbeat_path: "/api/beacon/{beacon_id}/heartbeat"

devices:
  - id: "light_1"
    type: "philips_hue"
    address: "192.168.1.201"
  - id: "curtain"
    type: "somfy"
    address: "192.168.1.202"

security:
  auth_enabled: true
  tls_enabled: false  # Development only
```

### 10.2 Personal Agent Configuration

**Config File**: `config/personal_agent.yaml`
```yaml
agent:
  id: "personal-agent-user1"
  user_id: "user1"
  version: "1.0.0"

beacon:
  scan_interval: 1
  rssi_threshold: -70
  hysteresis: 5

mqtt:
  qos: 1
  keep_alive: 60
  auto_reconnect: true
  reconnect_delay: 1

central_agent:
  subscribe_topics:
    - "home/state"
    - "home/policy"
    - "home/events"
  arbitration_timeout: 5  # seconds

voice:
  wake_word: "小狐狸"
  language: "zh-CN"
```

### 10.3 Central Agent Configuration

**Config File**: `config/central_agent.yaml`
```yaml
agent:
  id: "central-agent-1"
  home_id: "home-001"
  version: "1.0.0"

mqtt:
  broker:
    # Connect to all room brokers
    brokers:
      - room_id: "bedroom"
        host: "192.168.1.100"
        port: 1883
      - room_id: "living_room"
        host: "192.168.1.101"
        port: 1883
  qos_default: 1

global_state:
  storage_backend: "sqlite"  # or postgresql, redis
  state_file: "/var/lib/central-agent/state.db"
  update_interval: 60  # seconds

policies:
  rules_file: "/etc/central-agent/policies.yaml"
  reload_on_change: true

arbitration:
  default_timeout: 5
  max_retries: 3
  decision_log: "/var/log/central-agent/arbitration.log"

users:
  - user_id: "user1"
    role: "admin"
    priority: 100
  - user_id: "user2"
    role: "adult"
    priority: 80
  - user_id: "child1"
    role: "child"
    priority: 50

home_modes:
  - name: "home"
    default: true
  - name: "away"
    auto_trigger: true
    trigger_condition: "no_users_home_for_10min"
  - name: "sleep"
    schedule: "22:00-07:00"
  - name: "vacation"
    manual_only: true
```

## 11. Testing Strategy

### 11.1 Unit Testing

**Coverage Targets**:
- Spatial detection algorithm: 100%
- Message serialization/deserialization: 100%
- Topic routing logic: 90%+

### 11.2 Integration Testing

**Test Scenarios**:
1. Full flow: Beacon → Beacon Registry API → MQTT → Control
2. Multiple Personal Agents in same room
3. Room Agent failure and recovery
4. Network interruption handling

### 11.3 Hardware-in-the-Loop

**Required Tests**:
- Real BLE beacon detection accuracy
- Beacon Registry API discovery across different network configurations
- MQTT performance with target message rates

## 12. Deployment & Operations

### 12.1 Monitoring

**Metrics to Collect**:
```yaml
room_agent_metrics:
  - mqtt_messages_received_per_second
  - mqtt_messages_sent_per_second
  - active_connections
  - average_message_latency
  - device_control_success_rate
  - cpu_usage
  - memory_usage
```

**Health Checks**:
```yaml
health_check:
  mqtt_broker:
    endpoint: "/health/mqtt"
    expected_response: "healthy"
  device_connectivity:
    endpoint: "/health/devices"
    check_interval: 60s
```

### 12.2 Logging

**Log Levels**:
- `DEBUG`: Detailed beacon RSSI values
- `INFO`: Connection events, state changes
- `WARNING`: Retries, degraded mode activation
- `ERROR`: Connection failures, device control failures

**Log Format**: JSON structured logging
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "agent_id": "room-agent-1",
  "event": "mqtt_client_connected",
  "client_id": "personal-agent-user1",
  "remote_ip": "192.168.1.50"
}
```

## 13. Extensibility Points

### 13.1 Adding New Device Types

**Steps**:
1. Define device schema in `Room Agent` config
2. Implement device adapter (if needed)
3. Add device to `/description` response
4. Test control and state reporting

### 13.2 Cross-Room Communication

**⚠️ TO BE DEFINED**: Requirements for cross-room scenarios

**Potential Approaches**:
- Room-to-room MQTT bridge
- Central orchestration service
- Federation protocol

### 13.3 Cloud Integration (Optional)

**Use Cases**:
- Remote access via VPN
- Cloud-based voice processing
- Analytics and logging

**⚠️ TO BE DEFINED**: Cloud integration architecture

## 14. Open Questions & TODO

### 14.1 High Priority

- [ ] **Security**: Define authentication token management (JWT issuance, refresh)
- [ ] **Security**: Certificate strategy for TLS (self-signed setup, rotation)
- [ ] **State**: Choose Room Agent state storage backend
- [ ] **Discovery**: Handle multiple Room Agents in same room (HA scenario)
- [ ] **Robot**: Define Robot Agent task schema and capabilities
- [ ] **Testing**: Set up integration test environment
- [ ] **Central Agent**: Define policy rule schema and language
- [ ] **Central Agent**: Implement conflict resolution algorithms
- [ ] **Central Agent**: Choose global state storage backend

### 14.2 Medium Priority

- [ ] **Performance**: Benchmark maximum message throughput per broker
- [ ] **Reliability**: Define HA strategy for Room Agent (active-passive? active-active?)
- [ ] **UX**: Define user feedback for spatial detection errors
- [ ] **Privacy**: Define data retention policy for state/history
- [ ] **Config**: Dynamic config reload mechanism

### 14.3 Low Priority

- [ ] **Cloud**: Design cloud integration (if needed)
- [ ] **Analytics**: Define telemetry schema for system monitoring
- [ ] **Federation**: Design cross-room communication protocol
- [ ] **Edge Cases**: Multi-user conflict resolution (simultaneous control requests)

## 15. Appendix

### 15.1 Technology Rationale

**Why BLE Beacon?**
- Low power, suitable for battery-operated beacons
- Widely supported on mobile devices
- No pairing required
- Good spatial resolution with RSSI

**Why Beacon Registry API?**
- Explicit, auditable source of truth for room-to-agent binding
- Works across network segments without multicast
- Supports heartbeat and stale record handling
- Aligns with existing qwen-backend deployment

**Why MQTT?**
- Lightweight, suitable for IoT
- Built-in QoS levels
- Pub/sub decouples agents
- Efficient for small, frequent messages
- Widely adopted in IoT industry

### 15.2 Alternative Technologies Considered

| Component | Chosen | Alternatives | Rationale |
|-----------|--------|--------------|-----------|
| Spatial | BLE Beacon | WiFi triangulation, UWB | BLE is power-efficient and sufficient for room-level accuracy |
| Discovery | Beacon Registry API | mDNS, static config | API is explicit, centralized, and works across subnets |
| Communication | MQTT | HTTP, CoAP, gRPC | MQTT's pub/sub model fits async agent communication |
| Data | JSON | MessagePack, CBOR | JSON is human-readable and widely supported |

### 15.3 Central Agent vs Traditional Home Controller

| Aspect | Traditional Controller | Central Agent |
|--------|----------------------|---------------|
| **Control Philosophy** | Centralized command-and-control | Logical centralization, decentralized execution |
| **Device Control** | Direct device control | No direct device control, only policy arbitration |
| **User Interaction** | Direct user commands | Passive monitoring, intervene only when necessary |
| **Decision Making** | Makes all decisions | Respects Room Agent autonomy, arbitrates conflicts |
| **Failure Impact** | Single point of failure | Graceful degradation, Room Agents continue operating |
| **Scope** | Controls everything | Global state, policies, and consistency only |
| **Coupling** | Tight coupling with devices | Loose coupling, rule-based coordination |

**Key Difference**: Traditional controllers are "active commanders" while Central Agent is a "passive guardian" - it maintains global consistency without breaking local autonomy.

### 15.4 References

- MQTT Specification: https://mqtt.org/mqtt-specification/
- Beacon Registry API: qwen-backend `/api/beacon/*`
- BLE Beacon Format: https://specifications.bluetooth.com/thesis-packages/
