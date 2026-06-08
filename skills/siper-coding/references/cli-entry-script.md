# CLI 入口脚本模式

创建类似 `hermes` 的 CLI 命令（如 `siper`），让用户可以直接在终端输入 `siper` 启动服务。

## 当前命令格式（v0.4.24+）

```
siper          # 后台启动服务（subprocess.Popen + start_new_session=True）
siper stop     # 停止服务（PID文件 + 端口清理）
siper restart  # 重启服务（stop + start）
siper status   # 查看运行状态
```

**注意**：v0.4.24 起去掉了 `--` 前缀（`--stop` → `stop`，`--status` → `status`），并新增 `restart` 命令。

## 创建步骤

### 1. 创建 Python 脚本

```python
#!/home/gavin/.hermes/hermes-agent/venv/bin/python3
# -*- coding: utf-8 -*-
"""Siper AI Agent CLI - 启动/停止/重启 Siper Web UI 服务"""
import sys
import os
import signal
import subprocess

PROJECT_DIR = "/home/gavin/.siper"
PID_FILE = os.path.join(PROJECT_DIR, ".siper.pid")
VENV_PYTHON = "/home/gavin/.hermes/hermes-agent/venv/bin/python3"

def start():
    # 检查是否已在运行
    if os.path.exists(PID_FILE):
        with open(PID_FILE) as f:
            try:
                old_pid = int(f.read().strip())
                os.kill(old_pid, 0)
                print(f"Siper 已在运行中 (PID: {old_pid})")
                return
            except (ProcessLookupError, ValueError):
                os.remove(PID_FILE)
    # 后台启动
    proc = subprocess.Popen(
        [VENV_PYTHON, "-u", os.path.join(PROJECT_DIR, "siper_web.py")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL, cwd=PROJECT_DIR,
        start_new_session=True,
    )
    with open(PID_FILE, "w") as f:
        f.write(str(proc.pid))
    print(f"Siper 已启动 (PID: {proc.pid})")
    print(f"Web UI: http://localhost:7240")

def stop():
    if os.path.exists(PID_FILE):
        with open(PID_FILE) as f:
            pid = int(f.read().strip())
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"已停止 Siper (PID: {pid})")
        except ProcessLookupError:
            print(f"进程 {pid} 不存在")
        os.remove(PID_FILE)
    # 清理端口残留
    _kill_by_port(7240)
    _kill_by_port(7241)

def _kill_by_port(port):
    try:
        result = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
        for pid_str in result.stdout.strip().split("\\n"):
            try:
                os.kill(int(pid_str.strip()), signal.SIGTERM)
            except (ProcessLookupError, ValueError):
                pass
    except FileNotFoundError:
        pass

def status():
    if not os.path.exists(PID_FILE):
        print("Siper 未运行")
        return
    with open(PID_FILE) as f:
        pid = int(f.read().strip())
    try:
        os.kill(pid, 0)
        print(f"Siper 运行中 (PID: {pid})")
    except ProcessLookupError:
        print(f"Siper 未运行（PID 文件残留，进程 {pid} 不存在）")

if __name__ == "__main__":
    cmd = sys.argv[1].lstrip("-") if len(sys.argv) > 1 else ""
    if cmd == "stop": stop()
    elif cmd == "restart": stop(); start()
    elif cmd == "status": status()
    else: start()
```

### 2. 添加到 PATH

```bash
# ~/.bashrc 中添加
export PATH="$HOME/.local/bin:$PATH"
```

### 3. 设置可执行权限

```bash
chmod +x ~/.local/bin/siper
```

## 关键注意事项

### ⚠️ `~` 路径展开陷阱

在 hermes 环境中，`~` 和 `$HOME` 会被覆盖为 `/home/gavin/.hermes/profiles/coding/home`，不是真实的 `/home/gavin`。

**错误示例**（会失败）：
```python
PROJECT_DIR = os.path.expanduser('~/.siper')  # 展开为错误的路径
```

**正确做法**：
```python
PROJECT_DIR = "/home/gavin/.siper"  # 硬编码绝对路径
```

### ⚠️ `nohup` 在脚本中不可靠

在 bash 脚本中使用 `nohup` 时，`$HOME` 展开可能异常。推荐使用：
- `background=true` 参数（hermes terminal 工具）
- 或直接运行 Python 脚本（脚本本身处理自动重启）

### PID 文件管理

在 `siper_web.py` 的 `main()` 函数中添加：

```python
async def main():
    # ... 初始化代码 ...
    
    # 写入 PID 文件
    pid_file = PROJECT_ROOT / ".siper.pid"
    try:
        with open(pid_file, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    
    # ... 服务器代码 ...
    
    # 在 finally 块中清理 PID
    finally:
        # ... 清理代码 ...
        try:
            pid_file.unlink(missing_ok=True)
        except Exception:
            pass
```

## 使用示例

```bash
siper          # 启动服务
siper stop     # 停止服务
siper restart  # 重启服务
siper status   # 查看状态
```

## 验证

```bash
# 检查服务是否运行
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240  # 应返回 200

# 检查 PID 文件
cat ~/.siper/.siper.pid

# 检查进程
ps -p $(cat ~/.siper/.siper.pid) -o pid,cmd
```
