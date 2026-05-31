"""
File Write Tool - Write content to files.
"""

from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class WriteFileTool(BaseTool):
    """Write content to a file, creating parent directories as needed."""

    def __init__(self):
        super().__init__(
            name="write_file",
            description="Write content to a file. Creates parent directories automatically. OVERWRITES the entire file. Use this to create or update files. Supports Windows paths (e.g. C:\\Users\\file.txt) - automatically converted to Linux paths.",
            schema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path to write (absolute or relative)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Complete content to write to the file"
                    }
                },
                "required": ["path", "content"]
            },
            toolsets=["file", "core"],
            category=ToolCategory.FILE
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        file_path = parameters.get("path", "")
        content = parameters.get("content", "")

        try:
            path = Path(file_path).expanduser().resolve()

            # Protect agent configuration files — use centralized safety check
            from .path_safety import is_protected_agent_file
            if is_protected_agent_file(path):
                return ToolResult(
                    success=False,
                    error="写入被拒绝：Agent 配置文件（soul.md/agent.md/memory.md）只能通过 Web UI 保存"
                )

            path.parent.mkdir(parents=True, exist_ok=True)

            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            return ToolResult(
                success=True,
                data=f"Written {len(content)} chars to {path}",
                metadata={
                    "path": str(path),
                    "chars_written": len(content),
                    "bytes_written": len(content.encode("utf-8"))
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Write error: {str(e)}"
            )
