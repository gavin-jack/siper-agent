# Windows 原生部署 — 跨平台兼容性修复

## 问题：Windows 上 Python 模块不兼容

### 1. `signal` 模块 — SIGKILL 不存在

**现象**: `import signal` 在 Windows 上不会报错，但 `signal.SIGKILL` 不存在，运行时 `AttributeError`。

**修复** — 条件导入 + 提前定义 `_is_win`:
```python
import platform as _platform
_is_win = _platform.system() == "Windows"
if not _is_win:
    import signal
```

`signal.SIGKILL` 仅在 `_is_win=False` 的 else 分支使用，逻辑安全。加 `# type: ignore[attr-defined]` 消除静态分析警告。

**位置**: `siper_web.py` 顶部 import 区域（第 14 行附近）。

### 2. 工具文件中硬编码 `/home/gavin/.siper/` 路径

**现象**: 多个 tool 文件硬编码 WSL 绝对路径，Windows 上路径不存在。

**修复模式** — 用 `Path(__file__)` 相对定位:
```python
# tools/ 目录下的文件：tools → ai_agent → project_root（向上 3 层）
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CRONJOBS_FILE = _PROJECT_ROOT / "data" / "cronjobs.json"
```

**已修复文件**:
| 文件 | 硬编码路径 | 修复后 |
|------|-----------|--------|
| `cronjob_tool.py:14` | `/home/gavin/.siper/data/cronjobs.json` | `_PROJECT_ROOT / "data" / "cronjobs.json"` |
| `todo_tool.py:14` | `/home/gavin/.siper/data/todos.json` | `_PROJECT_ROOT / "data" / "todos.json"` |
| `send_message_tool.py:67` | `/home/gavin/.siper/data/outbox.json` | `_project_root / "data" / "outbox.json"` |
| `image_gen_tool.py:68` | `/home/gavin/.siper/uploads/images` | `_project_root / "uploads" / "images"` |
| `skills_tool.py:15-16` | `/home/gavin/.siper/skills/` | `_PROJ / "skills"` |
| `skills_list_tool.py:35` | `/home/gavin/.siper/skills` | `Path(...).parent.parent.parent / "skills"` |
| `skills_view_tool.py:44` | `/home/gavin/.siper/skills/{name}/SKILL.md` | `_proj / "skills" / name / "SKILL.md"` |
| `tts_tool.py:64` | `/home/gavin/.siper/uploads/audio` | `_proj / "uploads" / "audio"` |

**注意**: description 字符串中的路径引用也需改为通用描述。

### 3. `execute_code_tool.py` — `/tmp/` 和 `python3`

**现象**: `/tmp/` 是 Unix 路径；`python3` 命令在 Windows 上不存在。

**修复**:
```python
import sys  # 新增
from pathlib import Path  # 新增

_proj_tmp = Path(__file__).resolve().parent.parent.parent / ".tmp"
_proj_tmp.mkdir(exist_ok=True)
tmp_path = _proj_tmp / f"siper_exec_{timestamp}.py"
# ...
result = subprocess.run([sys.executable, tmp_path], ...)  # 替代 ["python3", ...]
```

临时文件写入项目 `.tmp/` 目录。

### 4. Windows 批处理 — 缺少 `cd /d %~dp0`

**现象**: 双击 `.bat` 时如果当前目录不是脚本所在目录，找不到 `siper_web.py`。

**修复**:
```bat
@echo off
cd /d %~dp0    :: 必须：切换到脚本所在目录
python siper_web.py
```

### 5. PID 文件权限问题（v0.9.28+）

**现象**: 安装到 `D:\Program Files\` 等系统保护目录时，`_pid_file.write_text(str(os.getpid()))` 报 `PermissionError: [Errno 13] Permission denied`。

**根因**: `_pid_file = PROJECT_ROOT / ".siper.pid"` 写入安装目录，但 Program Files 下普通进程无写入权限。

**修复** — PID 文件改写到用户 home 目录:
```python
# siper_web.py 约第 2076 行
_pid_file = Path.home() / ".siper" / ".siper.pid"
_pid_file.parent.mkdir(parents=True, exist_ok=True)
```

**效果**: Windows 下 PID 文件写到 `C:\Users\<用户名>\.siper\.siper.pid`，不再依赖安装目录写入权限。

**注意**: 旧版 `_pid_file = PROJECT_ROOT / ".siper.pid"` 必须替换，否则 Program Files 下必然崩溃。

### 6. LLM Client 未初始化时保存配置崩溃（v0.9.28+）

**现象**: 用户首次启动（无 API Key，`agent.llm_client` 为 `None`）→ Web UI 配置页面填入模型信息点保存 → 后端 `api_update_config` 或 `api_update_agent_meta` 中 `cur = agent.llm_client` 为 `None`，随后 `cur.model` / `cur.base_url` / `cur.api_key` 报 `AttributeError: 'NoneType' object has no attribute 'model'`。

**根因**: 两处代码（`siper_web.py` 第 911 行和第 1038 行）在重建 LLM Client 前未检查 `agent.llm_client` 是否为 `None`：
```python
# 旧代码（崩溃）
cur = agent.llm_client
rebuild_model = new_model or cur.model        # ← cur 为 None 时崩溃
rebuild_base_url = new_base_url or cur.base_url
rebuild_api_key = new_api_key or cur.api_key
```

**修复** — 加 `if cur else ""` 守卫 + 空 Key 时跳过 configure_llm（不 return，避免跳过后续字段更新）:
```python
# 新代码（安全）
cur = agent.llm_client
rebuild_model = new_model or (cur.model if cur else "")
rebuild_base_url = new_base_url or (cur.base_url if cur else "")
rebuild_api_key = new_api_key or (cur.api_key if cur else "")
if rebuild_api_key:
    vision_key = os.environ.get("SENSENOVA_API_KEY", "")
    agent.configure_llm(
        api_key=rebuild_api_key,
        base_url=rebuild_base_url,
        model=rebuild_model,
        vision_api_key=vision_key,
        vision_base_url="https://token.sensenova.cn/v1",
        vision_model="sensenova-6.7-flash-lite",
    )
    logger.info(f"LLM 客户端已更新：模型={rebuild_model}, 地址={rebuild_base_url}")
else:
    logger.warning("配置更新：未提供 API Key，跳过 LLM 客户端重建")
```

**⚠️ 陷阱**: 不要用 `return {"success": False}` 提前返回——这会跳过后续的 `agent_name`、`max_tools`、`session_timeout` 等字段更新。必须用 `if/else` 仅跳过 `configure_llm` 调用。

**影响范围**: 两处均需修复：
| 位置 | 函数 | 路由 |
|------|------|------|
| `siper_web.py` 第 911 行 | `api_update_config()` | `POST /api/config` |
| `siper_web.py` 第 1038 行 | `api_update_agent_meta()` | `POST /api/agents/{name}/meta` |

**检查清单第6项**:
```bash
# 确认两处均有 if cur else "" 守卫
grep -A5 "cur = agent.llm_client" siper_web.py | grep "if cur else"
# 确认无 "return.*success.*False" 在 configure_llm 块内
grep -n "return.*success.*False" siper_web.py
```

## 检查清单（Windows 原生部署前）

```bash
# 1. 确认无硬编码 WSL 路径
grep -rn "/home/gavin/.siper" . --include="*.py" | grep -v __pycache__

# 2. 确认 signal 条件导入
head -20 siper_web.py | grep -A2 "import platform"

# 3. 确认 execute_code_tool.py 有 import sys, Path
head -10 ai_agent/tools/execute_code_tool.py

# 4. 确认 start_windows.bat 有 cd /d %~dp0
head -5 start_windows.bat

# 5. 确认 PID 文件写到 Path.home()
grep -n "_pid_file" siper_web.py

# 6. 确认 LLM Client None 守卫
grep -A5 "cur = agent.llm_client" siper_web.py | grep "if cur else"
```

## 版本历史
- v0.9.26: 修复 signal 条件导入、工具文件硬编码路径、execute_code_tool.py 的 /tmp/ 和 python3
- v0.9.28: 修复 PID 文件权限问题（Path.home()）、补充检查清单第5项
- v0.9.28: 修复 LLM Client 未初始化时保存配置崩溃（`if cur else ""` 守卫）、补充检查清单第6项
