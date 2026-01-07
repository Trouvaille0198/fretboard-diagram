#!/bin/bash

echo "========================================"
echo "简单登录功能集成测试"
echo "========================================"
echo ""

# 检查文件结构
echo "1. 检查文件结构..."
files=(
    "backend/Dockerfile"
    "backend/requirements.txt"
    "backend/app/__init__.py"
    "backend/app/main.py"
    "backend/app/config.py"
    "backend/app/database.py"
    "backend/app/models.py"
    "backend/app/auth.py"
    "backend/app/routers/__init__.py"
    "backend/app/routers/auth.py"
    "backend/app/routers/data.py"
    "src/utils/api.js"
    "src/hooks/useAuth.js"
    "src/components/LoginModal.jsx"
    "src/components/LoginModal.css"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (缺失)"
        all_exist=false
    fi
done

echo ""

if [ "$all_exist" = true ]; then
    echo "✓ 所有文件已创建"
else
    echo "✗ 部分文件缺失"
    exit 1
fi

echo ""
echo "2. 检查 Docker 配置..."

# 检查 docker-compose.yml
if grep -q "backend:" docker-compose.yml && grep -q "mongodb:" docker-compose.yml; then
    echo "  ✓ docker-compose.yml 已更新"
else
    echo "  ✗ docker-compose.yml 配置不完整"
    exit 1
fi

# 检查 nginx.conf
if grep -q "location /api/" nginx.conf; then
    echo "  ✓ nginx.conf 已添加 API 代理"
else
    echo "  ✗ nginx.conf 缺少 API 代理配置"
    exit 1
fi

echo ""
echo "3. 检查前端代码集成..."

# 检查 Fretboard.jsx
if grep -q "useAuth" src/Fretboard.jsx && grep -q "LoginModal" src/Fretboard.jsx; then
    echo "  ✓ Fretboard.jsx 已集成登录功能"
else
    echo "  ✗ Fretboard.jsx 未正确集成"
    exit 1
fi

# 检查键盘处理器
if grep -q "saveToServer" src/handlers/keyboardHandlers.js; then
    echo "  ✓ 键盘处理器已添加服务器保存"
else
    echo "  ✗ 键盘处理器未更新"
    exit 1
fi

echo ""
echo "========================================"
echo "✓ 所有检查通过！"
echo "========================================"
echo ""
echo "下一步："
echo "1. 确保 Docker 网络正常"
echo "2. 运行: docker-compose up -d"
echo "3. 访问: http://localhost:1645"
echo ""
echo "测试流程："
echo "1. 首次访问会显示登录界面"
echo "2. 输入用户名登录（3-20个字符）"
echo "3. 操作指板后按 Ctrl+S 保存到服务器"
echo "4. 刷新页面，数据会自动加载"
echo ""
