"""
Execute Command Tool - Run shell commands safely.
"""

import asyncio
import shutil
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


# Dangerous commands — source of truth is path_safety.DANGEROUS_COMMAND_PATTERNS
from .path_safety import DANGEROUS_COMMAND_PATTERNS


class ExecuteCommandTool(BaseTool):
    """Execute shell commands with timeout and safety restrictions."""

    # Alias for backward compatibility (checked via self.BLOCKED_PATTERNS at runtime)
    BLOCKED_PATTERNS = DANGEROUS_COMMAND_PATTERNS

    def __init__(self):
        super().__init__(
            name="execute_command",
            description="Execute a shell command and return the output. Has safety restrictions on dangerous commands. Supports timeout. Use this to run system commands, build scripts, etc. Windows paths in commands (e.g. C:\\Users\\...) are automatically converted to WSL paths (/mnt/c/Users/...).",
            schema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default: 30, max: 120)",
                        "default": 30
                    },
                    "workdir": {
                        "type": "string",
                        "description": "Working directory (optional)",
                        "default": None
                    }
                },
                "required": ["command"]
            },
            toolsets=["terminal", "core"],
            category=ToolCategory.UTILITY,
        )
        self._timeout = 30

    def check_fn(self):
        """检查命令执行环境是否可用。"""
        return shutil.which("bash") is not None or shutil.which("sh") is not None

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        command = parameters.get("command", "")
        timeout = min(parameters.get("timeout", 30), 120)
        workdir = parameters.get("workdir", None)

        # Safety check
        cmd_lower = command.lower().strip()
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.lower() in cmd_lower:
                return ToolResult(
                    success=False,
                    error=f"Command blocked for safety: contains '{pattern}'"
                )

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return ToolResult(
                    success=False,
                    error=f"Command timed out after {timeout}s",
                    metadata={"timeout": True}
                )

            output = stdout.decode("utf-8", errors="replace")
            errors = stderr.decode("utf-8", errors="replace")

            result_text = output
            if errors:
                result_text += f"\n[STDERR]\n{errors}"

            return ToolResult(
                success=proc.returncode == 0,
                data=result_text if result_text else "(no output)",
                metadata={
                    "exit_code": proc.returncode,
                    "command": command,
                    "output_chars": len(result_text)
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Execution error: {str(e)}"
            )
