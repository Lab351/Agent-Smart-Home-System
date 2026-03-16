#!/bin/bash
# Mosquitto MQTT Broker 快速启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Docker Compose文件
COMPOSE_FILE="$PROJECT_ROOT/mosquitto-docker-compose.yml"

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Mosquitto MQTT Broker 快速部署${NC}"
echo -e "${GREEN}================================${NC}"

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装${NC}"
    echo -e "${YELLOW}请安装Docker：${NC}"
    echo -e "  curl -fsSL get https://get.docker.com -o get-docker.sh"
    echo -e "  sudo sh get-docker.sh"
    exit 1
fi

# 检查Docker Compose是否安装（支持插件版本 docker compose 和独立版本 docker-compose）
if docker compose version &> /dev/null; then
    USE_COMPOSE=true
elif command -v docker-compose &> /dev/null; then
    USE_COMPOSE=true
else
    echo -e "${YELLOW}警告: Docker Compose未安装${NC}"
    echo -e "${YELLOW}将使用Docker原生命令${NC}"
    USE_COMPOSE=false
fi

# 检查端口是否被占用
check_port() {
    local port=$1
    if docker ps | grep -q ":$port->"; then
        echo -e "${YELLOW}警告: 端口 $port 已被占用${NC}"
        read -p "$(echo -e "${YELLOW}是否继续? [y/N]: ")"
        [[ $REPLY =~ ^[Yy]$ ]]
    fi
}

echo -e "${NC}检查端口..."
check_port 1884
check_port 9002
check_port 9000

# 显示菜单
show_menu() {
    echo -e "${NC}"
    echo -e "${GREEN}请选择操作：${NC}"
    echo -e "  1) 启动Mosquitto"
    echo -e "  2) 停止Mosquitto"
    echo -e "  3) 重启Mosquitto"
    echo -e "  4) 查看日志"
    echo -e "  5) 查看状态"
    echo -e "  6) 进入容器Shell"
    echo -e "  7) 清理数据（重启）"
    echo -e "  8) 备份数据"
    echo -e "  0) 退出"
    echo -e "${NC}"
}

# 启动Mosquitto
start_mosquitto() {
    echo -e "${GREEN}启动Mosquitto MQTT Broker...${NC}"

    if [ "$USE_COMPOSE" = true ]; then
        docker compose -f "$COMPOSE_FILE" up -d
    else
        docker run -d \
            --name mosquitto-broker \
            -p 1884:1884 -p 9002:9002 -p 9000:9000 \
            -v "$PROJECT_ROOT/docker/mosquitto:/mosquitto" \
            eclipse-mosquitto:2.0.18
    fi
}

# 停止Mosquitto
stop_mosquitto() {
    echo -e "${YELLOW}停止Mosquitto MQTT Broker...${NC}"

    if [ "$USE_COMPOSE" = true ]; then
        docker compose -f "$COMPOSE_FILE" down
    else
        docker stop mosquitto-broker
        docker rm mosquitto-broker
    fi
}

# 重启Mosquitto
restart_mosquitto() {
    echo -e "${YELLOW}重启Mosquitto MQTT Broker...${NC}"
    stop_mosquitto
    sleep 2
    start_mosquitto
}

# 查看日志
show_logs() {
    echo -e "${GREEN}显示日志（Ctrl+C退出）...${NC}"

    if [ "$USE_COMPOSE" = true ]; then
        docker compose -f "$COMPOSE_FILE" logs -f mosquitto
    else
        docker logs -f mosquitto-broker
    fi
}

# 查看状态
show_status() {
    echo -e "${GREEN}Mosquitto状态：${NC}"

    if docker ps | grep -q mosquitto-broker; then
        echo -e "${GREEN}● 运行中${NC}"
        docker ps | grep mosquitto-broker
    else
        echo -e "${YELLOW}○ 未运行${NC}"
    fi

    echo -e "${NC}连接信息：${NC}"
    echo -e "  MQTT协议:    mqtt://<本机IP>:1884"
    echo -e "  MQTT over WS: ws://<本机IP>:9002/mqtt"
    echo -e "  Web配置界面:  http://<本机IP>:9000"
    echo -e "${NC}"

    # 显示测试命令
    echo -e "${YELLOW}测试命令：${NC}"
    echo -e "  # 订阅房间状态"
    echo -e "  mosquitto_sub -h <本机IP> -p 1884 -t \"room/+/agent/+/state\" -v"
    echo -e "  "
    echo -e "  # 发布测试消息"
    echo -e "  mosquitto_pub -h <本机IP> -p 1884 -t \"room/bedroom/agent/room-agent-bedroom/state\" -m '{\"online\": true}'"
}

# 进入容器Shell
enter_shell() {
    echo -e "${GREEN}进入Mosquitto容器Shell...${NC}"

    if docker ps | grep -q mosquitto-broker; then
        if [ "$USE_COMPOSE" = true ]; then
            docker compose -f "$COMPOSE_FILE" exec mosquitto sh
        else
            docker exec -it mosquitto-broker sh
        fi
    else
        echo -e "${RED}错误: Mosquitto未运行${NC}"
    fi
}

# 清理数据（重启）
clean_data() {
    echo -e "${YELLOW}清理数据并重启...${NC}"
    read -p "$(echo -e "${RED}这将清除所有MQTT消息和订阅！确认？[y/N]: ")"
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}已取消${NC}"
        return
    fi

    stop_mosquitto
    docker volume rm mosquitto-data
    start_mosquitto
}

# 备份数据
backup_data() {
    local backup_dir="$PROJECT_ROOT/backup/mosquitto-data-$(date +%Y%m%d)"
    mkdir -p "$backup_dir"

    echo -e "${GREEN}备份数据到: $backup_dir${NC}"

    if docker ps | grep -q mosquitto-broker; then
        if [ "$USE_COMPOSE" = true ]; then
            docker cp mosquitto-broker:/mosquitto/data "$backup_dir/"
        else
            docker run --rm \
                -v "$backup_dir:/backup" \
                -v mosquitto-data:/mosquitto/data \
                alpine tar -C /mosquitto/data . /backup
        fi
    else
        echo -e "${YELLOW}警告: Mosquitto未运行${NC}"
    fi

    echo -e "${GREEN}备份完成！${NC}"
    ls -lh "$backup_dir"
}

# 主循环
while true; do
    show_menu
    read -p "$(echo -e "${GREEN}请输入选项: ")" choice

    case $choice in
        1)
            start_mosquitto
            ;;
        2)
            stop_mosquitto
            ;;
        3)
            restart_mosquitto
            ;;
        4)
            show_logs
            ;;
        5)
            show_status
            ;;
        6)
            enter_shell
            ;;
        7)
            clean_data
            ;;
        8)
            backup_data
            ;;
        0)
            echo -e "${GREEN}退出${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选项: $choice${NC}"
            ;;
    esac

    echo -e "${NC}"
    read -p "$(echo -e "${GREEN}按Enter继续...")"
done
