# Mosquitto MQTT Broker 部署指南

本指南提供Mosquitto MQTT Broker的快速部署方案，支持Room Agent通信规范。

---

## 快速开始

### Docker部署（推荐）

```bash
# 启动Mosquitto Broker
docker-compose -f mosquitto-docker-compose.yml up -d

# 查看日志
docker-compose -f mosquitto-docker-compose.yml logs -f mosquitto

# 停止服务
docker-compose -f mosquitto-docker-compose.yml down
```

### 2. 查看Web界面

访问MQTT配置界面：
- http://<服务器IP>:9000
- 默认无需认证（开发环境）

### 3. 测试MQTT连接

```bash
# 安装mosquitto客户端
sudo apt install mosquitto-clients

# 测试订阅
mosquitto_sub -h <服务器IP> -p 1883 -t "room/+/agent/+/state"

# 测试发布
mosquitto_pub -h <服务器IP> -p 1883 -t "room/bedroom/agent/room-agent-bedroom/state" -m '{"online": true}'
```

---

## 服务器配置

### 防火墙配置

```bash
# 开放MQTT端口
sudo ufw allow 1883/tcp  # MQTT
sudo ufw allow 9001/tcp  # MQTT over WebSocket

# 开放Web配置界面端口
sudo ufw allow 9000/tcp
```

### Systemd服务（可选）

创建持久化服务：`/etc/systemd/system/mosquitto-docker.service`

```ini
[Unit]
Description=Mosquitto MQTT Broker
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/services/home-system-mqtt-broker
ExecStart=/usr/bin/docker-compose -f mosquitto-docker-compose.yml up -d
ExecStop=/usr/bin/docker-compose -f mosquitto-docker-compose.yml down

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl enable mosquitto-docker.service
sudo systemctl start mosquitto-docker.service
```

---

## 生产环境配置

> **重要提示**: eclipse-mosquitto 镜像**不支持通过环境变量配置**。
> 所有配置都需要在 `mosquitto/config/mosquitto.conf` 文件中设置。

### 1. 启用认证

#### 1.1 生成密码文件

```bash
# 进入配置目录
cd mosquitto/config

# 生成密码文件（会提示输入密码）
mosquitto_passwd -c passwd mqtt_admin

# 添加更多用户（不要再用 -c 参数，会覆盖文件）
mosquitto_passwd -b passwd user2 password2
```

#### 1.2 修改 mosquitto.conf

取消注释并修改以下配置：

```conf
# 禁止匿名访问
allow_anonymous false

# 配置密码文件
password_file /mosquitto/config/passwd

# 如果需要每个监听器独立配置
per_listener_settings false
```

#### 1.3 重启服务

```bash
docker-compose -f mosquitto-docker-compose.yml restart
```

### 2. 启用TLS（推荐）

```bash
# 生成证书
mkdir -p mosquitto/certs
cd mosquitto/certs

# 生成CA证书
openssl genrsa -des3 -out ca.key 2048
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt

# 生成服务器证书
openssl genrsa -out server.key 2048
openssl req -new -x509 -days 3650 \
  -CA ca.crt -CAkey ca.key \
  -key server.key -out server.csr
openssl x509 -req -in server.csr -out server.crt -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.srl
```

修改`mosquitto.conf`添加listener配置：

```conf
listener 8883
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
cafile /mosquitto/certs/ca.crt
```

### 3. 限制访问

使用ACL文件限制主题访问（参考`aclfile`）。

### 4. 启用日志持久化

修改 `mosquitto.conf` 添加日志配置：

```conf
# 日志类型：debug, error, warning, notice, information
log_type all
log_dest file /mosquitto/logs/mosquitto.log
log_dest stdout

# 日志详细程度
log_type debug
```

Docker Compose 已配置日志卷持久化：
```yaml
volumes:
  - mosquitto-logs:/mosquitto/logs
```

---

## 监控和维护

### 健康检查

```bash
# 检查服务状态
curl http://localhost:9000/api/broker

# 查看连接数
docker exec mosquitto-broker mosquitto_sub -t '$SYS/broker/connection/#' -C 1 -v

# 查看订阅数
docker exec mosquitto-broker mosquitto_sub -t '$SYS/broker/subscriptions/#' -C 1 -v
```

### 日志查看

```bash
# 实时日志
docker-compose -f mosquitto-docker-compose.yml logs -f mosquitto

# 持久化日志
docker exec mosquitto-broker tail -f /mosquitto/logs/mosquitto.log
```

### 备份和恢复

```bash
# 备份持久化数据
docker cp mosquitto-broker:/mosquitto/data ./backup/mosquitto-data-$(date +%Y%m%d)

# 恢复数据
docker cp ./backup/mosquitto-data-20250113 mosquitto-broker:/mosquitto/data/
docker-compose -f mosquitto-docker-compose.yml restart
```

---

## 性能调优

> **配置位置**: 所有性能参数都在 `mosquitto/config/mosquitto.conf` 中设置

### 内存优化

修改 `mosquitto.conf`：

```conf
# 最大连接数
max_connections 5000

# 最大排队消息（每个连接）
max_queued_messages 5000
```

### 消息大小限制

修改 `mosquitto.conf`：

```conf
# 消息最大大小（字节）
message_size_limit 268435456  # 256MB
```

### 持久化间隔

修改 `mosquitto.conf`：

```conf
# 持久化间隔（秒）
autosave_interval 3600  # 1小时
```

---

## 故障排查

### 问题：容器无法启动

```bash
# 检查日志
docker-compose -f mosquitto-docker-compose.yml logs mosquitto

# 检查端口占用
sudo netstat -tulp | grep -E "1883|9001|9000"

# 检查Docker网络
docker network ls
docker network inspect <network_name>
```

### 问题：网络池冲突（Pool overlaps）

**错误信息**：
```
failed to create network: Error response from daemon: invalid pool request:
Pool overlaps with other one on this address space
```

**原因**：
Docker 网络的子网配置与服务器上已存在的网络冲突。

**解决方案 1**：删除冲突的网络（推荐）
```bash
# 查看所有Docker网络
docker network ls

# 删除未使用的网络
docker network prune

# 删除特定网络（如果确定未使用）
docker network rm <network_name>

# 重新启动服务
docker-compose -f mosquitto-docker-compose.yml up -d
```

**解决方案 2**：修改当前网络的子网
```bash
# 编辑 mosquitto-docker-compose.yml
# 在 networks.default.ipam.config 中修改为其他子网，如：
# subnet: 172.28.0.0/16
# 或
# subnet: 10.10.0.0/16
```

**解决方案 3**（最佳）：删除固定子网配置
```bash
# 删除整个 ipam.config 配置块
# 让 Docker 自动分配可用的子网
# 这是当前 mosquitto-docker-compose.yml 的默认配置
```

### 问题：无法连接

1. 检查防火墙：`sudo ufw status`
2. 检查服务端口：`netstat -tulp | grep 1883`
3. 检查Docker端口映射：`docker ps`

### 问题：权限错误

```bash
# 检查数据卷权限
docker exec mosquitto-broker ls -la /mosquitto/data

# 修复权限
docker exec mosquitto-broker chown -R 1883:1883 /mosquitto/data
```

### 问题：性能问题

```bash
# 增加内存限制（重启服务）
docker-compose -f mosquitto-docker-compose.yml up -d --scale mosquitto=1

# 或添加资源限制到 mosquitto-docker-compose.yml
# deploy:
#   resources:
#     limits:
#       memory: 1G
```

---

## Room Agent配置

### 更新Room Agent配置连接到外部Broker

修改`config/room_agent.yaml`：

```yaml
mqtt:
  broker:
    host: "<服务器IP>"  # 改为MQTT服务器IP
    port: 1883
    username: null      # 如果启用认证则填写
    password: null
```

---

## 参考资源

- **Mosquitto文档**: https://mosquitto.org/
- **MQTT协议**: https://mqtt.org/mqtt-specification/
- **Docker Mosquitto**: https://hub.docker.com/eclipse-mosquitto
- **Room Agent文档**: `/home/jetson/Project/srp_backend/docs/ESP32_BEACON_BINDING.md`

---

## 快速命令参考

```bash
# 启动
docker-compose -f mosquitto-docker-compose.yml up -d

# 停止
docker-compose -f mosquitto-docker-compose.yml down

# 重启
docker-compose -f mosquitto-docker-compose.yml restart

# 查看日志
docker-compose -f mosquitto-docker-compose.yml logs -f mosquitto

# 进入容器
docker exec -it mosquitto-broker sh

# 查看连接统计
docker exec mosquitto-broker mosquitto_sub -t '$SYS/broker/connections' -C 1 -v
```

---

**部署完成时间估计**: 5-10分钟

**需要的环境**: Docker + Docker Compose 或 Podman
