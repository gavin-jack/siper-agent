"""
Path safety utilities for tool file operations.
Centralized path validation to prevent LLM from abusing file tools.
"""
from pathlib import Path
from typing import Tuple

# Sensitive system directories that must never be modified by LLM tools
SENSITIVE_DIRS = [
    "/etc/",
    "/sys/",
    "/proc/",
    "/dev/",
    "/boot/",
    "/root/",
]

# Agent configuration files that should only be modified via Web UI save API
PROTECTED_AGENT_FILES = [
    "agents/default/soul.md",
    "agents/default/agent.md",
    "agents/default/memory.md",
]

# Dangerous shell commands that should never be executed
DANGEROUS_COMMAND_PATTERNS = [
    "rm -rf /",
    "rm -rf /*",
    "mkfs.",
    "dd if=",
    ">: /dev/",
    "shutdown",
    "reboot",
    "init 0",
    "init 6",
    "poweroff",
    "halt",
]


def is_protected_agent_file(path: Path) -> bool:
    """Check if path is a protected agent configuration file."""
    path_str = str(path).replace("\\", "/")
    for pf in PROTECTED_AGENT_FILES:
        if path_str.endswith(pf):
            return True
    return False


def is_safe_path(path: Path) -> Tuple[bool, str]:
    """Check if a file path is safe to modify. Returns (safe, error_msg)."""
    resolved = path.resolve()

    # Must be an absolute path under /
    try:
        resolved.relative_to(Path("/"))
    except ValueError:
        return False, f"Invalid path: {path}"

    # Check against sensitive directories
    for sensitive in SENSITIVE_DIRS:
        try:
            resolved.relative_to(Path(sensitive))
            return False, f"禁止操作系统敏感目录: {sensitive}"
        except ValueError:
            continue

    # Check against protected agent configuration files
    if is_protected_agent_file(resolved):
        return False, "禁止直接修改 Agent 配置文件（soul.md/agent.md/memory.md），请通过 Web UI 保存"

    return True, ""


def is_dangerous_command(cmd: str) -> Tuple[bool, str]:
    """Check if a shell command is dangerous. Returns (dangerous, reason)."""
    cmd_lower = cmd.lower().strip()
    for pattern in DANGEROUS_COMMAND_PATTERNS:
        if pattern in cmd_lower:
            return True, f"危险命令被拦截: 包含 '{pattern}'"
    return False, ""
