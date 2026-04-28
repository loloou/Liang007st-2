@echo off
cd /d "%~dp0"

echo ========================================
echo liang007生图 - 绿色便携版打包
echo ========================================

:: ── 使用国内镜像解决 GitHub 下载超时 ──────────────────────────────
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo.
echo [1/3] 清理旧构建产物...
if exist "client\dist" rmdir /s /q "client\dist"
if exist "dist-electron" rmdir /s /q "dist-electron"

echo.
echo [2/3] 构建前端 (Vite + React)...
call npm run build
if errorlevel 1 (
    echo.
    echo 错误: 前端构建失败
    pause
    exit /b 1
)

echo.
echo [3/3] 打包 Electron 便携版...
call npx electron-builder --win portable

if exist "dist-electron\liang007生图.exe" (
    for %%A in ("dist-electron\liang007生图.exe") do set SIZE=%%~zA
    set /a SIZE_MB=%SIZE:~0,-3% / 1000
    echo.
    echo ========================================
    echo 打包成功!
    echo 输出: dist-electron\liang007生图.exe
    echo 大小: %SIZE% 字节 ^(约 %SIZE_MB% MB^)
    echo ========================================
) else (
    echo.
    echo 错误: 打包失败，未找到 exe 文件
)

pause
