# 跨平台部署指南（更新 v0.9.27）

## Windows 原生部署完整流程

### 前置条件
- Python 3.10+ 已安装（安装时勾选 "Add Python to PATH"）
- 项目文件已复制到 Windows 文件系统（**非** UNC 路径，**非** Program Files）

### 推荐安装路径
- ✅ `E:\SiPerAgent\` 或 `C:\Users\<用户>\SiPerAgent\`
- ❌ `D:\Program Files\siper agent\` — 系统保护目录，无法写入 PID 文件
- ❌ `\\wsl.localhost\Ubuntu\...` — CMD 不支持 UNC 路径

### requirements.txt（必须包含全部 3 个依赖）
```
openai>=1.0
websockets>=15.0
jinja2>=3.1
```
⚠️ 遗漏 `openai` 会导致 `ModuleNotFoundError`。

### config.json（部署包初始状态）
```json
{
  "name": "default",
  "icon": "🎭",
  "avatar": "agents/default/avatar.png",
  "models": [],
  "default_model": "",
  "tags": ["default"],
  "session_timeout": 3600,
  "max_tools": 30,
  "max_tool_rounds": 3
}
```
⚠️ `models` 必须为空数组，不含任何硬编码 API Key。

### start_windows.bat（纯英文，避免 CMD 乱码）
```bat
@echo off
title SiPer AI Agent
cd /d %~dp0
echo ========================================
echo   SiPer AI Agent
echo ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

pip show openai >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo Starting SiPer...
echo URL: http://127.0.0.1:9724
echo.

start http://127.0.0.1:9724
python siper_web.py

pause
```
⚠️ 关键点：(1) 纯英文，不含中文 (2) `cd /d %~dp0` 确保工作目录正确 (3) `pip show openai` 检测依赖 (4) `start` 自动打开浏览器。

## 常见启动错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `ModuleNotFoundError: No module named 'openai'` | requirements.txt 缺少 openai | `pip install openai` |
| `PermissionError: [Errno 13] .siper.pid` | Program Files 目录只读 | 换安装路径到非系统目录 |
| `Missing credentials` API Key 空字符串崩溃 | configure_llm(api_key="") | 确保 config.json 中 models 为空，代码已加守卫 |
| bat 中文乱码 | CMD 默认 GBK 编码 | bat 文件只用纯英文 |
| `python3` 命令不存在 | Windows 只有 `python` | 代码中用 `sys.executable` 替代 |

## 跨平台代码兼容性清单

部署包打包前必须确认以下修复已生效：

- [x] `siper_web.py`: `signal` 条件导入（Windows 无 SIGKILL）
- [x] `siper_web.py`: `_is_win` 提前到 import 区域
- [x] `siper_web.py`: 无 API Key 时不崩溃，跳过 LLM 初始化
- [x] `execute_code_tool.py`: `/tmp/` → `.tmp/`，`python3` → `sys.executable`
- [x] `execute_code_tool.py`: 添加 `import sys` 和 `from pathlib import Path`
- [x] 所有工具文件：`/home/gavin/.siper/` → `Path(__file__).resolve().parent.parent.parent`
- [x] `start_windows.bat`: 纯英文，`cd /d %~dp0`
- [x] `requirements.txt`: 包含 `openai>=1.0`
- [x] `config.json`: models 为空数组
- [x] 删除所有 `*.bak`、`__pycache__`、测试文件、WSL 专用文件

## WSL → Windows 部署包同步（v0.9.28+）

### ⚠️ config.json 安全规则
**部署包中的 `config.json` 不得包含任何 API Key 或模型绑定。**
- 同步前必须确认 `models: []` 和 `default_model: ""`
- 如果 WSL 开发版 config.json 含 API Key，**必须覆盖为干净版本**
- **禁止将含 API Key 的 config.json 打包到部署包**

### 同步路径
- **WSL 源**: `/home/gavin/.siper/`
- **Windows 目标**: `E:\SiPer agent\`（WSL 路径: `/mnt/e/SiPer agent/`）
- **部署包大小**: ~3.3MB

### 快速同步（单文件）
```bash
# 仅同步 siper_web.py（最常用）
cp /home/gavin/.siper/siper_web.py "/mnt/e/SiPer agent/siper_web.py"

# 同步 config.json
cp /home/gavin/.siper/agents/default/config.json "/mnt/e/SiPer agent/agents/default/config.json"

# 同步 settings.json
cp /home/gavin/.siper/settings.json "/mnt/e/SiPer agent/settings.json"
```

### 完整同步（推荐）
```bash
cd /home/gavin/.siper && python3 scripts/create_deploy.py
```
该脚本自动对比 WSL 源和部署包差异，确认后同步。

### 同步后操作
1. Windows 上关闭旧 SiPer 进程
2. 双击 `E:\SiPer agent\start_windows.bat` 重新启动
3. 浏览器访问 http://127.0.0.1:9724

### 注意事项
- 修改 `.py` 文件后**必须重启** SiPer 服务
- 修改 `.js/.css/.html` 后浏览器**硬刷新**（Ctrl+Shift+R）
- `E:\` 盘无权限限制，**不要用** `D:\Program Files\`
- WSL 无法写入 `D:\Program Files\`，需要 Windows 管理员权限

| 操作 | 可行性 | 说明 |
|------|--------|------|
| WSL 读取 Windows 文件 | ✅ | 通过 `/mnt/d/` 访问 |
| WSL 写入 Windows 非系统目录 | ✅ | 如 `E:\SiPerAgent\` |
| WSL 写入 Windows Program Files | ❌ | 权限不足，chmod 也无效 |
| WSL 修改 Windows bat 文件 | ⚠️ | 只读时无法写入 |
| Windows 访问 WSL localhost | ❌ | 网络隔离 |
