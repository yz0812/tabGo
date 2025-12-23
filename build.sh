#!/bin/bash

# TabGo Extension Build Script
# 用于本地打包测试

set -e

echo "=== TabGo Extension Build Script ==="

# 获取版本号
VERSION=$(grep -oP '"version":\s*"\K[^"]+' manifest.json)
echo "Extension version: $VERSION"

# 清理旧的构建
echo "Cleaning old builds..."
rm -rf build
rm -f tabgo-*.zip

# 创建构建目录
echo "Creating build directory..."
mkdir -p build/tabgo

# 复制文件
echo "Copying files..."
cp manifest.json build/tabgo/
cp -r background build/tabgo/
cp -r content build/tabgo/
cp -r popup build/tabgo/
cp -r options build/tabgo/
cp -r pages build/tabgo/
cp -r assets build/tabgo/

# 显示打包内容
echo ""
echo "=== Build contents ==="
ls -la build/tabgo/

# 创建 ZIP 包
echo ""
echo "Creating ZIP package..."
cd build
zip -r ../tabgo-${VERSION}.zip tabgo/
cd ..

# 显示结果
echo ""
echo "=== Build complete ==="
ls -lh tabgo-*.zip
echo ""
echo "Package created: tabgo-${VERSION}.zip"
echo "You can now load this extension in Chrome by:"
echo "1. Extract the ZIP file"
echo "2. Go to chrome://extensions/"
echo "3. Enable Developer mode"
echo "4. Click 'Load unpacked' and select the extracted folder"
