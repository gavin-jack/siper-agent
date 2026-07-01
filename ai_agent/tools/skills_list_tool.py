"""
Skills List Tool - List all available skills.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class SkillsListTool(BaseTool):
    """List all available skills from the skills directory."""

    def __init__(self):
        super().__init__(
            name="skills_list",
            description="列出所有可用技能。扫描 skills 目录，返回技能名称、描述和路径列表。可按类别筛选。",
            schema={
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "可选，按类别筛选技能",
                        "default": None
                    }
                },
                "required": []
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        category_filter = parameters.get("category", None)
        skills_dir = Path(__file__).resolve().parent.parent.parent / "skills"

        try:
            if not skills_dir.exists():
                return ToolResult(
                    success=True,
                    data=[],
                    metadata={"total": 0, "message": "技能目录不存在"}
                )

            skills: List[Dict[str, str]] = []

            for skill_path in sorted(skills_dir.iterdir()):
                if not skill_path.is_dir():
                    continue

                skill_md = skill_path / "SKILL.md"
                if not skill_md.exists():
                    continue

                # Extract description from SKILL.md (first non-empty line after title)
                description = ""
                try:
                    with open(skill_md, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                        # Skip title lines (starting with #) and empty lines
                        for line in lines:
                            stripped = line.strip()
                            if stripped and not stripped.startswith("#"):
                                description = stripped[:200]
                                break
                except Exception:
                    description = ""

                skill_info = {
                    "name": skill_path.name,
                    "description": description,
                    "path": str(skill_path)
                }

                # Apply category filter if provided
                if category_filter:
                    if category_filter.lower() in skill_path.name.lower() or \
                       category_filter.lower() in description.lower():
                        skills.append(skill_info)
                else:
                    skills.append(skill_info)

            return ToolResult(
                success=True,
                data=skills,
                metadata={
                    "total": len(skills),
                    "skills_dir": str(skills_dir),
                    "category_filter": category_filter
                }
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"扫描技能目录失败：{str(e)}"
            )
