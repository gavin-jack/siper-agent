# 工具路径安全 — 集中式防护模式

## 核心原则

**不要在每个工具中重复写安全检查代码**。创建公共模块 `ai_agent/tools/path_safety.py`，所有需要路径检查的工具共用。

## 文件位置

`ai_agent/tools/path_safety.py`

## 提供的函数

| 函数 | 用途 | 调用方 |
|---|---|---|
| `is_safe_path(path)` | 检查文件路径是否安全（敏感目录 + 受保护文件） | patch_tool, read_file_tool |
| `is_protected_agent_file(path)` | 检查是否是 Agent 配置文件 | write_file_tool |
| `is_dangerous_command(cmd)` | 检查 shell 命令是否危险 | execute_command_tool |

## 受保护文件

```python
PROTECTED_AGENT_FILES = [
    "agents/default/soul.md",
    "agents/default/agent.md",
    "agents/default/memory.md",
]
```

## 敏感目录

```python
SENSITIVE_DIRS = ["/etc/", "/sys/", "/proc/", "/dev/", "/boot/", "/root/"]
```

## 危险命令模式

```python
DANGEROUS_COMMAND_PATTERNS = [
    "rm -rf /", "rm -rf /*", "mkfs.", "dd if=",
    ">: /dev/", "shutdown", "reboot", "init 0", "init 6",
    "poweroff", "halt",
]
```

## 新增工具时的检查清单

任何涉及文件写入或命令执行的新工具，必须：
1. 文件写入工具 → 调用 `is_protected_agent_file()` + `is_safe_path()`
2. 命令执行工具 → 调用 `is_dangerous_command()`
3. 不要自己写检查逻辑，统一 import path_safety
