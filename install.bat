@echo off
chcp 65001 >nul
title Antigravity Token Monitor 一键安装与注入工具
echo ========================================================
echo     ⚡ Antigravity Token Monitor 悬浮配额监控组件
echo ========================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境，请先安装 Node.js (https://nodejs.org)
    pause
    exit /b 1
)

echo [1/2] 检查依赖...
if not exist "%~dp0node_modules\@electron\asar" (
    echo 正在安装 @electron/asar 工具库...
    call npm install @electron/asar --no-save
)

echo.
echo [2/2] 正在修补 app.asar 并热更新当前窗口...
node "%~dp0scripts\patch_asar.js"

echo.
echo ========================================================
echo     安装完成！已随 Antigravity 启动自动生效！
echo ========================================================
echo.
pause
