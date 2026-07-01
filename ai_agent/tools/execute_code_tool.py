"""
Execute Code Tool - Execute Python code in an isolated subprocess.

Safety:
- Separate subprocess (isolated from main process)
- Memory limit: 512MB default (configurable)
- Timeout: 5 minutes default (configurable)
- Auto-cleans temp files
"""
import os
import resource
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ExecuteCodeTool(BaseTool):
    """Execute Python code in an isolated subprocess with resource limits."""

    def __init__(self):
        super().__init__(
            name="execute_code",
            description=(
                "Execute Python code in an isolated subprocess.\n\n"
                "Safety:\n"
                "- Separate subprocess (isolated)\n"
                "- Memory limit: 512MB default\n"
                "- Timeout: 5 minutes default\n"
                "- Auto-cleans temp files\n\n"
                "Parameters:\n"
                "- code: Python code (required)\n"
                "- timeout: seconds (default: 300, max: 600)\n"
                "- max_memory_mb: memory limit in MB (default: 512, max: 2048)\n\n"
                "Returns: stdout with exit code and stderr"
            ),
            schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                    "timeout": {"type": "integer", "description": "Timeout in seconds (default: 300, max: 600)", "default": 300},
                    "max_memory_mb": {"type": "integer", "description": "Memory limit in MB (default: 512, max: 2048)", "default": 512},
                },
                "required": ["code"]
            },
            toolsets=["terminal", "core"],
            category=ToolCategory.UTILITY,
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        code = parameters.get("code", "")
        if not code.strip():
            return ToolResult(success=False, error="参数 'code' 不能为空")

        timeout = min(parameters.get("timeout", 300), 600)
        max_memory_mb = min(parameters.get("max_memory_mb", 512), 2048)

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".py", prefix="siper_exec_",
                dir=str(Path(__file__).resolve().parent.parent.parent / ".tmp"),
                delete=False, encoding="utf-8"
            ) as f:
                setup = f"""import resource
try:
    _max_bytes = {max_memory_mb} * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (_max_bytes, _max_bytes))
except (ValueError, OSError):
    pass
"""
                f.write(setup + code)
                tmp_path = f.name

            result = subprocess.run(
                [sys.executable, tmp_path],
                capture_output=True, text=True, timeout=timeout,
            )

            return ToolResult(
                success=result.returncode == 0,
                data=result.stdout,
                metadata={"exit_code": result.returncode, "stderr": result.stderr, "timeout": False}
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False, error=f"代码执行超时（超过 {timeout} 秒）",
                metadata={"exit_code": -1, "stderr": "timeout", "timeout": True}
            )
        except Exception as e:
            return ToolResult(
                success=False, error=f"执行错误: {str(e)}",
                metadata={"exit_code": -1, "stderr": str(e), "timeout": False}
            )
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
