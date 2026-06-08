# Agent 配置文件保护 — 集中式路径安全模块

## 问题

LLM 在工具调用循环中可以通过 `write_file` 或 `patch` 工具意外覆盖 Agent 配置文件（soul.md、agent.md、memory.md），导致配置丢失。

**实际案例**（2026-05-20）：LLM 在回答"chat-model-select 的 font-size 是多少"时陷入工具调用循环，期间调用了 `write_file(path="agents/default/soul.md", content="")`，将 soul.md 清空为 0 字节。同时 config.json 的模型配置也被清空。

## 根因

- `write_file_tool.py`：无任何路径限制，LLM 可写入任意文件
- `patch_tool.py`：`_is_safe_path()` 只检查系统敏感目录（/etc/、/sys/ 等），不检查 Agent 配置文件
- `max_tool_rounds` 默认 100，LLM 在简单查询上反复调用工具不收敛

## 修复方案：集中式安全模块

**不要在每个工具中重复写检查逻辑**，而是创建公共模块 `ai_agent/tools/path_safety.py`：

### path_safety.py 完整代码

```python
from pathlib import Path
from typing import Tuple

SENSITIVE_DIRS = ["/etc/", "/sys/", "/proc/", "/dev/", "/boot/", "/root/"]

PROTECTED_AGENT_FILES = [
    "agents/default/soul.md",
    "agents/default/agent.md",
    "agents/default/memory.md",
]

DANGEROUS_COMMAND_PATTERNS = [
    "rm -rf /", "rm -rf /*", "mkfs.", "dd if=",
    ">: /dev/", "shutdown", "reboot", "init 0", "init 6",
    "poweroff", "halt",
]

def is_protected_agent_file(path: Path) -> bool:
    path_str = str(path).replace("\\", "/")
    return any(path_str.endswith(pf) for pf in PROTECTED_AGENT_FILES)

def is_safe_path(path: Path) -> Tuple[bool, str]:
    resolved = path.resolve()
    try:
        resolved.relative_to(Path("/"))
    except ValueError:
        return False, f"Invalid path: {path}"
    for sensitive in SENSITIVE_DIRS:
        try:
            resolved.relative_to(Path(sensitive))
            return False, f"禁止操作系统敏感目录: {sensitive}"
        except ValueError:
            continue
    if is_protected_agent_file(resolved):
        return False, "禁止直接修改 Agent 配置文件（soul.md/agent.md/memory.md），请通过 Web UI 保存"
    return True, ""

def is_dangerous_command(cmd: str) -> Tuple[bool, str]:
    cmd_lower = cmd.lower().strip()
    for pattern in DANGEROUS_COMMAND_PATTERNS:
        if pattern in cmd_lower:
            return True, f"危险命令被拦截: 包含 '{pattern}'"
    return False, ""
```

### 各工具引用方式

**write_file_tool.py**：
```python
from .path_safety import is_protected_agent_file
if is_protected_agent_file(path):
    return ToolResult(success=False, error="写入被拒绝：Agent 配置文件只能通过 Web UI 保存")
```

**patch_tool.py**：
```python
from .path_safety import is_safe_path as _is_safe_path
# 删除原有的 _SENSITIVE_DIRS、_PROTECTED_AGENT_FILES、_is_protected_agent_file、_is_safe_path 定义
```

**execute_command_tool.py**：
```python
from .path_safety import is_dangerous_command
dangerous, reason = is_dangerous_command(cmd)
if dangerous:
    return ToolResult(success=False, error=reason)
```

## 恢复流程

当 soul.md 被清空时：
1. 检查 `agents/default/soul.md.bak` 是否存在且非空
2. `cp agents/default/soul.md.bak agents/default/soul.md`
3. 同样恢复 `config.json`：`cp config.json.bak config.json`
4. 重启 SiPer 服务

## 关联问题：LLM 工具调用循环

**症状**：LLM 对简单问题反复调用工具，始终返回 `finish_reason=tool_calls` 而不生成最终文本回复。

**原因**：22 个工具太多 + `max_tool_rounds` 默认 100 太高 + 流式请求无响应触发重试

**缓解**：降低 `max_tool_rounds` 到 5-10（config.json 中设置）

## 关联 Bug：textarea placeholder "加载中..."

当 soul.md 内容为空时，`<textarea placeholder="加载中...">` 会显示"加载中..."，用户误以为页面卡住。

**修复**：将 placeholder 改为"（暂无内容）"，加载完成后设置 `ta.value = content`（空字符串也会清除 placeholder）。

## ⚠️ Hermes Agent 绕过风险（v0.9.85d+）

**SiPer 的 path_safety.py 只保护 SiPer 自身工具**，不保护 Hermes Agent 的工具：

- Hermes Agent 的 `agent/file_safety.py` 中 `build_write_denied_paths()` 只包含：`.ssh/`、`.env`、`.bashrc`、`.zshrc`、`/etc/sudoers` 等
- `build_write_denied_prefixes()` 只包含：`.ssh/`、`.aws/`、`.gnupg/`、`.kube/`、`.docker/` 等
- **不包含** `/home/gavin/.siper/agents/default/soul.md`

**结论**：LLM 通过 Hermes Agent 的 `write_file` 工具可以直接写入 soul.md，绕过 SiPer 的所有保护。`execute_command` 工具也可以执行任意 shell 命令绕过。

## ⚠️ save_agent_file 空内容漏洞（v0.9.85d+）

即使通过 Web UI 的正常保存流程，`save_agent_file()` 也不拒绝空内容写入：

- `api_save_agent_file()` 中 `body.get("content", "")` 在 content 缺失时返回空字符串
- `save_agent_file()` 直接写入，不检查 content 是否为空
- 结果：先备份原文件到 `.bak`，再写入空字符串

**修复**（双层防护）：
1. `agents/__init__.py`：`save_agent_file()` 拒绝 None/空字符串/纯空白内容
2. `siper_web.py`：`api_save_agent_file()` 提前检查并返回错误

详见 `references/soul-md-empty-content-protection.md`。
