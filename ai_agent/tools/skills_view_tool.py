"""
Skill View Tool - View skill details by reading SKILL.md.
"""

from pathlib import Path
from typing import Dict, Any, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class SkillViewTool(BaseTool):
    """View skill details by reading the SKILL.md file."""

    def __init__(self):
        super().__init__(
            name="skill_view",
            description="查看技能详情。读取指定技能的 SKILL.md 文件内容。提供技能名称即可，也可通过 file_path 直接指定文件路径。",
            schema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "技能名称（目录名），例如 'github'"
                    },
                    "file_path": {
                        "type": "string",
                        "description": "可选，直接指定 SKILL.md 的完整路径。如果提供此项，则忽略 name 参数。",
                        "default": None
                    }
                },
                "required": ["name"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        name = parameters.get("name", "")
        file_path = parameters.get("file_path", None)

        try:
            if file_path:
                path = Path(file_path).expanduser().resolve()
            elif name:
                _proj = Path(__file__).resolve().parent.parent.parent
                # Try direct path first: skills/<name>/SKILL.md
                path = _proj / "skills" / name / "SKILL.md"
                if not path.exists():
                    # Search one level deeper: skills/*/<name>/SKILL.md
                    found = None
                    for _dir in (_proj / "skills").iterdir():
                        if _dir.is_dir() and not _dir.name.startswith("_") and not _dir.name.startswith("."):
                            _candidate = _dir / name / "SKILL.md"
                            if _candidate.exists():
                                found = _candidate
                                break
                    if found:
                        path = found
            else:
                return ToolResult(
                    success=False,
                    error="必须提供技能名称（name）或文件路径（file_path）"
                )

            if not path.exists():
                return ToolResult(
                    success=False,
                    error=f"技能文件不存在：{path}"
                )

            if not path.is_file():
                return ToolResult(
                    success=False,
                    error=f"路径不是文件：{path}"
                )

            file_size = path.stat().st_size
            if file_size > 500_000:
                return ToolResult(
                    success=False,
                    error=f"文件过大（{file_size:,} 字节）。最大允许 500KB。"
                )

            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            return ToolResult(
                success=True,
                data=content,
                metadata={
                    "path": str(path),
                    "name": name or path.parent.name,
                    "size": file_size
                }
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"读取技能文件失败：{str(e)}"
            )
