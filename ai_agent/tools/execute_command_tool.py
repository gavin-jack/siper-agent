"""
Execute Command Tool - Run shell commands with safety restrictions.

Safety model:
- Blocklist: known-dangerous patterns (rm -rf /, mkfs, dd, shutdown, etc.)
- Workdir restriction: commands can only run in allowed directories
- Timeout: configurable, max 300s
- Environment filtering: removes dangerous env vars (LD_PRELOAD, etc.)
"""
import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Set
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory
from .path_safety import DANGEROUS_COMMAND_PATTERNS

_ALLOWED_BASE_DIRS: Set[str] = set()

def _init_allowed_dirs():
    global _ALLOWED_BASE_DIRS
    home = str(Path.home())
    _ALLOWED_BASE_DIRS = {home, "/tmp", "/var/tmp"}
    try:
        proj = str(Path(__file__).resolve().parent.parent.parent)
        _ALLOWED_BASE_DIRS.add(proj)
    except Exception:
        pass
    if Path("/mnt").exists():
        _ALLOWED_BASE_DIRS.add("/mnt")

_init_allowed_dirs()

_DANGEROUS_ENV_VARS = frozenset({
    "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT",
    "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
})

ALLOWED_COMMAND_PREFIXES: list = []

_BLOCKED_PATTERNS = [re.compile(re.escape(p), re.IGNORECASE) for p in DANGEROUS_COMMAND_PATTERNS]


def _is_command_safe(command: str) -> tuple[bool, str]:
    cmd = command.strip()
    for pat in _BLOCKED_PATTERNS:
        if pat.search(cmd):
            return False, f"匹配危险模式: {pat.pattern}"
    if ALLOWED_COMMAND_PREFIXES:
        cmd_lower = cmd.lower()
        if not any(cmd_lower.startswith(prefix.lower()) for prefix in ALLOWED_COMMAND_PREFIXES):
            allowed = ", ".join(ALLOWED_COMMAND_PREFIXES)
            return False, f"不在允许的命令前缀列表中。允许: {allowed}"
    return True, ""


def _is_workdir_safe(workdir: str) -> tuple[bool, str]:
    try:
        resolved = Path(workdir).resolve()
        resolved_str = str(resolved)
        for allowed in _ALLOWED_BASE_DIRS:
            if resolved_str.startswith(allowed):
                return True, ""
        return False, f"工作目录 '{workdir}' 不在允许的路径下。允许: {', '.join(sorted(_ALLOWED_BASE_DIRS))}"
    except (OSError, ValueError) as e:
        return False, f"无效的工作目录: {e}"


def _sanitize_env(env: Optional[Dict[str, str]]) -> Dict[str, str]:
    if not env:
        return {}
    return {k: v for k, v in env.items() if k.upper() not in _DANGEROUS_ENV_VARS}


class ExecuteCommandTool(BaseTool):
    """Execute shell commands with timeout, blocklist, and workdir restrictions."""

    def __init__(self):
        super().__init__(
            name="execute_command",
            description=(
                "Execute a shell command and return output.\n\n"
                "Safety:\n"
                "- Blocklist: dangerous patterns blocked\n"
                "- Workdir: must be under allowed paths (home, /tmp, project, /mnt)\n"
                "- Env: dangerous vars filtered\n\n"
                "Parameters:\n"
                "- command: shell command (required)\n"
                "- timeout: seconds (default: 30, max: 300)\n"
                "- workdir: working directory (optional)\n"
                "- env: extra env vars (optional)\n\n"
                "Returns: stdout + stderr with exit code"
            ),
            schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"},
                    "timeout": {"type": "integer", "description": "Timeout in seconds (default: 30, max: 300)", "default": 30},
                    "workdir": {"type": "string", "description": "Working directory (optional)", "default": None},
                    "env": {"type": "object", "description": "Extra env vars (dangerous vars filtered)", "default": None},
                },
                "required": ["command"]
            },
            toolsets=["terminal", "core"],
            category=ToolCategory.UTILITY,
        )

    def check_fn(self):
        return shutil.which("bash") is not None or shutil.which("sh") is not None

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        command = parameters.get("command", "")
        timeout = min(parameters.get("timeout", 30), 300)
        workdir = parameters.get("workdir", None)
        env = parameters.get("env", None)

        safe, reason = _is_command_safe(command)
        if not safe:
            return ToolResult(success=False, error=f"命令被安全策略阻止: {reason}")

        if workdir:
            safe, reason = _is_workdir_safe(workdir)
            if not safe:
                return ToolResult(success=False, error=f"工作目录被安全策略阻止: {reason}")

        safe_env = _sanitize_env(env)

        try:
            proc_env = os.environ.copy()
            proc_env.update(safe_env)

            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir,
                env=proc_env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return ToolResult(success=False, error=f"命令执行超时（{timeout}秒）", metadata={"timeout": True})

            output = stdout.decode("utf-8", errors="replace")
            errors = stderr.decode("utf-8", errors="replace")
            result_text = output
            if errors:
                result_text += f"\n[STDERR]\n{errors}"

            return ToolResult(
                success=proc.returncode == 0,
                data=result_text if result_text else "(no output)",
                metadata={"exit_code": proc.returncode, "command": command, "output_chars": len(result_text)}
            )
        except Exception as e:
            return ToolResult(success=False, error=f"执行错误: {str(e)}")
