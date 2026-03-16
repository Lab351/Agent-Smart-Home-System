# 安全认证机制

## 优先级: P2 (Medium)

## 标签
`security` `infrastructure` `mqtt`

## 概述
实现 MQTT 通信的安全认证机制，包括用户认证、Topic ACL 和可选的 TLS 加密。

## 背景与动机
根据 [通信协议规范](../docs/communication.md#7-安全与认证)，生产环境需要完整的安全保障。

## 安全架构

```
┌─────────────────────────────────────────────────────────────┐
│                       安全层                                 │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   TLS 1.3    │  │    ACL      │  │   Auth      │     │
│  │   加密传输    │  │   访问控制   │  │   身份认证   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 任务清单

### MQTT 认证
- [ ] 用户名/密码认证
- [ ] 客户端证书认证（可选）
- [ ] Token 认证（JWT 或共享密钥）
- [ ] 认证失败处理

### Topic ACL
- [ ] Personal Agent 权限定义
  ```yaml
  personal_agent:
    can_publish:
      - "room/{room_id}/agent/*/control"
      - "room/{room_id}/agent/*/describe"
      - "home/arbitration"
    can_subscribe:
      - "room/{room_id}/agent/*/state"
      - "room/{room_id}/agent/*/description"
      - "home/state"
      - "home/policy"
  ```

- [ ] Room Agent 权限定义
  ```yaml
  room_agent:
    can_publish:
      - "room/{room_id}/agent/+/state"
      - "room/{room_id}/agent/+/description"
      - "room/{room_id}/agent/+/heartbeat"
      - "home/arbitration"
    can_subscribe:
      - "room/{room_id}/agent/+/control"
      - "room/{room_id}/agent/+/describe"
      - "home/policy"
  ```

- [ ] Central Agent 权限定义
  ```yaml
  central_agent:
    can_publish:
      - "home/+"
    can_subscribe:
      - "room/+/agent/+/state"
      - "home/arbitration"
  ```

### TLS 加密
- [ ] TLS 1.3 支持
- [ ] 证书验证
- [ ] 加密套件配置
  ```yaml
  encryption:
    mqtt:
      tls_enabled: true
      tls_version: "1.3"
      certificate_validation: true
      cipher_suites:
        - "TLS_AES_128_GCM_SHA256"
        - "TLS_AES_256_GCM_SHA384"
  ```

## 配置示例

```yaml
mqtt:
  broker:
    host: "192.168.1.100"
    port: 8883  # TLS 端口
    ws_port: 9002  # TLS WebSocket
  
  auth:
    mechanism: "username_password"
    username: "agent-{type}-{id}"
    password_format: "token"
    token_expiry: 86400
  
  tls:
    enabled: true
    version: "1.3"
    ca_cert: "/etc/mqtt/ca.crt"
    client_cert: "/etc/mqtt/client.crt"
    client_key: "/etc/mqtt/client.key"
```

## Mosquitto ACL 配置

```
# /etc/mosquitto/aclfile

# Personal Agent
user personal-agent-*
topic write room/+/agent/+/control
topic write room/+/agent/+/describe
topic write home/arbitration
topic read room/+/agent/+/state
topic read room/+/agent/+/description
topic read home/state
topic read home/policy

# Room Agent
user room-agent-*
topic write room/+/agent/+/state
topic write room/+/agent/+/description
topic write room/+/agent/+/heartbeat
topic write home/arbitration
topic read room/+/agent/+/control
topic read room/+/agent/+/describe
topic read home/policy

# Central Agent
user central-agent-*
topic write home/+
topic read room/+/agent/+/state
topic read home/arbitration
```

## 文件位置
- `mqtt-broker/mosquitto/config/aclfile`
- `shared/mqtt/auth.py`

## 验收标准
- [ ] 认证机制正常工作
- [ ] ACL 限制生效
- [ ] TLS 加密连接成功
- [ ] 无权限操作被拒绝

## 相关文档
- [通信协议规范 - 安全与认证](../docs/communication.md#7-安全与认证)