"""
List Directory Tool - List files and directories.
"""

from pathlib import Path
from typing import Dict, Any
from datetime import datetime
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ListDirTool(BaseTool):
    """List directory contents with file type and size info."""

    def __init__(self):
        super().__init__(
            name="list_dir",
            description="List files and directories in a path. Shows name, type, size, and modification time. Use this to explore the filesystem. Supports Windows paths (e.g. C:\\Users\\Desktop) and WSL paths (\\\\wsl.localhost\\distro\\path) - automatically converted to Linux paths.",
            schema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to list (default: current directory)",
                        "default": "."
                    },
                    "show_hidden": {
                        "type": "boolean",
                        "description": "Show hidden files (starting with .)",
                        "default": False
                    }
                },
                "required": []
            },
            toolsets=["file", "core"],
            category=ToolCategory.FILE
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        dir_path = parameters.get("path", ".")
        show_hidden = parameters.get("show_hidden", False)

        try:
            path = Path(dir_path).expanduser().resolve()
            if not path.exists():
                return ToolResult(success=False, error=f"Directory not found: {dir_path}")
            if not path.is_dir():
                return ToolResult(success=False, error=f"Not a directory: {dir_path}")

            items = []
            for item in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                if not show_hidden and item.name.startswith("."):
                    continue
                try:
                    stat = item.stat()
                    items.append({
                        "name": item.name,
                        "type": "dir" if item.is_dir() else "file",
                        "size": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
                except PermissionError:
                    items.append({
                        "name": item.name,
                        "type": "inaccessible",
                        "size": 0,
                        "modified": ""
                    })

            # Format output
            lines = []
            for item in items:
                if item["type"] == "dir":
                    lines.append(f"  📁 {item['name']}/")
                elif item["type"] == "inaccessible":
                    lines.append(f"  🔒 {item['name']} (permission denied)")
                else:
                    size = self._format_size(item["size"])
                    lines.append(f"  📄 {item['name']}  ({size})")

            return ToolResult(
                success=True,
                data="\n".join(lines) if lines else "(empty directory)",
                metadata={
                    "path": str(path),
                    "count": len(items),
                    "dirs": sum(1 for i in items if i["type"] == "dir"),
                    "files": sum(1 for i in items if i["type"] == "file")
                }
            )
        except Exception as e:
            return ToolResult(success=False, error=f"List error: {str(e)}")

    @staticmethod
    def _format_size(size: int) -> str:
        if size < 1024:
            return f"{size}B"
        elif size < 1024 * 1024:
            return f"{size/1024:.1f}KB"
        else:
            return f"{size/(1024*1024):.1f}MB"
