@echo off
chcp 65001 >nul
title SiPer AI Agent

set VENV_DIR=%~dp0.venv
set PYTHON=%VENV_DIR%\Scripts\python.exe
set PYTHONDONTWRITEBYTECODE=1

if not exist "%PYTHON%" (
    echo [ERROR] 虚拟环境不存在：%VENV_DIR%
    echo 请先运行：python -m venv .venv ^&^& .venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

cd /d %~dp0

echo [SiPer] 启动中...
start "SiPer" "%PYTHON%" -u siper_web.py 7240

timeout /t 3 >nul

echo [SiPer] 等待服务启动...
:check_port
netstat -ano | findstr ":7240.*LISTEN" >nul
if errorlevel 1 (
    timeout /t 1 >nul
    goto check_port
)

echo [SiPer] 服务已启动，打开浏览器...
start http://localhost:7240
