#!/bin/bash

echo "🎮 字垣 (WordWall) - 开发启动脚本"
echo "================================"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 请先安装 Node.js"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 请先安装 npm"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo "✅ npm 版本: $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install --legacy-peer-deps

# 检查依赖是否安装成功
if [ $? -eq 0 ]; then
    echo "✅ 依赖安装完成"
else
    echo "❌ 依赖安装失败"
    exit 1
fi

echo ""
echo "🚀 启动开发服务器..."
echo "请在手机上安装 Expo Go 应用"
echo ""

# 启动 Expo
npm start