#!/bin/bash

# Qwen Backend 部署脚本

set -e

echo "🚀 开始部署 Qwen Backend..."

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "❌ 错误：.env 文件不存在"
    echo "请先复制 .env.example 为 .env 并配置 API Key"
    exit 1
fi

# 构建镜像
echo "📦 构建 Docker 镜像..."
docker-compose build

# 停止旧容器
echo "🛑 停止旧容器..."
docker-compose down

# 启动新容器
echo "▶️  启动新容器..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
if docker-compose ps | grep -q "Up"; then
    echo "✅ 部署成功！"
    echo "📡 服务地址：http://localhost:3000"
    echo "📋 查看日志：docker-compose logs -f"
else
    echo "❌ 部署失败，请查看日志："
    docker-compose logs
    exit 1
fi
