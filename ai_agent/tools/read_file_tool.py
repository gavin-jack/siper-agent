"""
File Read Tool - Read file contents with line numbers.
"""

from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ReadFileTool(BaseTool):
    """Read file contents with optional line range and pagination."""

    def __init__(self):
        super().__init__(
            name="read_file",
            description="Read a text file with line numbers. Supports pagination via offset and limit. Use this to inspect code, configs, logs, etc. Supports Windows paths (e.g. C:\\Users\\file.txt) and WSL paths (\\\\wsl.localhost\\distro\\path) - automatically converted to Linux paths.",
            schema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path to read (absolute, relative, or ~/path)"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Line number to start reading from (1-indexed, default: 1)",
                        "default": 1
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of lines to read (default: 500, max: 2000)",
                        "default": 500
                    }
                },
                "required": ["path"]
            },
            toolsets=["file", "core"],
            category=ToolCategory.FILE
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        file_path = parameters.get("path", "")
        offset = parameters.get("offset", 1)
        limit = parameters.get("limit", 500)

        # Clamp limit
        limit = min(max(limit, 1), 2000)
        offset = max(offset, 1)

        try:
            # Replace placeholder paths that LLM may generate
            file_path = str(file_path).replace('<项目目录>', str(Path(__file__).resolve().parent.parent.parent))
            file_path = str(file_path).replace('<project_dir>', str(Path(__file__).resolve().parent.parent.parent))
            path = Path(file_path).expanduser().resolve()
            if not path.exists():
                return ToolResult(
                    success=False,
                    error=f"File not found: {file_path}"
                )
            if not path.is_file():
                return ToolResult(
                    success=False,
                    error=f"Not a file: {file_path}"
                )

            # Check file size (max 500KB for safety)
            file_size = path.stat().st_size
            if file_size > 500_000:
                return ToolResult(
                    success=False,
                    error=f"文件过大（{file_size:,} 字节 / {file_size // 1024}KB）。最大允许 500KB。请使用 offset 和 limit 参数分页读取。"
                )

            with open(path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            total_lines = len(lines)
            start = offset - 1
            end = start + limit
            selected = lines[start:end]

            content_lines = []
            for i, line in enumerate(selected):
                line_num = start + i + 1
                content_lines.append(f"{line_num:6d}|{line.rstrip()}")

            content = "\n".join(content_lines)

            return ToolResult(
                success=True,
                data=content,
                metadata={
                    "path": str(path),
                    "total_lines": total_lines,
                    "offset": offset,
                    "limit": limit,
                    "returned": len(selected),
                    "truncated": end < total_lines
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Read error: {str(e)}"
            )
