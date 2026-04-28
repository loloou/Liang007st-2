@echo off
cd /d C:\Users\PCnine\Desktop\cs1\cur-01\02-2
echo 正在安装依赖...
call npm install
echo.
echo 正在启动开发服务器...
call npm run dev
pause
