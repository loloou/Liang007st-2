@echo off
chcp 65001 >nul
echo ========================================
echo   AI 生图工具 - 开发服务器启动
echo ========================================
echo.

cd /d "%~dp0"
echo 当前目录: %CD%
echo.

echo [1/2] 检查依赖...
if not exist "node_modules\" (
    echo 检测到 node_modules 不存在，正在安装依赖...
    call npm install
    echo.
)

echo [2/2] 启动开发服务器...
echo.
echo 服务器启动后，请在浏览器中访问: http://localhost:5173
echo.
echo ----------------------------------------
echo 按 Ctrl+C 可停止服务器
echo ----------------------------------------
echo.

call npm run dev

pause
