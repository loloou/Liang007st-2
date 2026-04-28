# 打包单文件便携版 exe
# 这个脚本会将整个应用目录打包成一个自解压的 exe

$ErrorActionPreference = "Stop"

$appName = "liang007生图"
$sourceDir = "C:\Users\PCnine\Desktop\cs1\cur-01\02-2\dist-electron\$appName-win32-x64"
$outputFile = "C:\Users\PCnine\Desktop\cs1\cur-01\02-2\dist-electron\$appName-单文件版.exe"

Write-Host "正在创建单文件便携版..."
Write-Host "源目录: $sourceDir"
Write-Host "输出文件: $outputFile"

if (-not (Test-Path $sourceDir)) {
    Write-Host "错误: 源目录不存在，请先运行打包命令"
    exit 1
}

# 方法：创建一个自解压的批处理脚本，然后转换为 exe
$scriptContent = @'
@echo off
set APPDIR=%~dp0app
if not exist "%APPDIR%" (
    echo 正在解压...
    mkdir "%APPDIR%"
    powershell -Command "Expand-Archive -Path '%~dp0app.zip' -DestinationPath '%APPDIR%' -Force"
)
start "" "%APPDIR%\liang007生图.exe"
'@

# 创建临时目录
$tempDir = "$env:TEMP\liang007_packing"
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 复制应用文件
Copy-Item "$sourceDir\*" -Destination $tempDir -Recurse

# 压缩应用
$zipPath = "$tempDir\app.zip"
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

Write-Host "已创建压缩包: $zipPath"
Write-Host "注意: 要创建真正的单文件 exe，需要使用专门的压缩工具如 7-Zip SFX"
Write-Host ""
Write-Host "当前可用的便携版位于:"
Write-Host "  $sourceDir"
Write-Host ""
Write-Host "可以将整个文件夹压缩后分发给别人使用"
