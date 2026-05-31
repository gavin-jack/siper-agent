"""
Execute Code Tool - Execute Python code in a subprocess.
"""

import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ExecuteCodeTool(BaseTool):
    """Execute Python code in an isolated subprocess with a 5-minute timeout."""

    def __init__(self):
        super().__init__(
            name="execute_code",
            description=(
                "执行 Python 代码。代码可以调用 hermes_tools 模块中的工具函数。"
                "适合需要多步工具调用+处理逻辑的复杂任务。5分钟超时。"
            ),
            schema={
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "要执行的 Python 代码"
                    }
                },
                "required": ["code"]
            },
            toolsets=["terminal", "core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        code = parameters.get("code", "")
        if not code.strip():
            return ToolResult(
                success=False,
                error="参数 'code' 不能为空"
            )

        timestamp = int(time.time() * 1000)
        _proj_tmp = Path(__file__).resolve().parent.parent.parent / ".tmp"
        _proj_tmp.mkdir(exist_ok=True)
        tmp_path = _proj_tmp / f"siper_exec_{timestamp}.py"

        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(code)

            result = subprocess.run(
                [sys.executable, tmp_path],
                capture_output=True,
                text=True,
                timeout=300
            )

            return ToolResult(
                success=result.returncode == 0,
                data=result.stdout,
                metadata={
                    "exit_code": result.returncode,
                    "stderr": result.stderr
                }
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                error="代码执行超时（超过 300 秒 / 5 分钟）",
                metadata={"exit_code": -1, "stderr": "timeout"}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"执行错误: {str(e)}",
                metadata={"exit_code": -1, "stderr": str(e)}
            )
