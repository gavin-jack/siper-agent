"""
Skills Management Tool - Manage AI agent skills (list, view, create, edit, delete).
"""

import shutil
from pathlib import Path
from typing import Dict, Any, List
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class SkillsTool(BaseTool):
    """Manage skills stored in the project skills/ directory."""

    _PROJ = Path(__file__).resolve().parent.parent.parent
    SKILLS_DIR = _PROJ / "skills"
    BACKUP_DIR = _PROJ / "skills" / ".deleted"

    def __init__(self):
        super().__init__(
            name="skill_manage",
            description=(
                "Manage AI agent skills. "
                "Actions: list (list all skills), view (view skill details), "
                "create (create a new skill), edit (edit a skill's SKILL.md), "
                "delete (move skill to backup). "
                "Skills are stored in the project skills/ directory."
            ),
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "Action to perform: list, view, create, edit, delete",
                        "enum": ["list", "view", "create", "edit", "delete"]
                    },
                    "name": {
                        "type": "string",
                        "description": "Skill name (required for view, create, edit, delete)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content for SKILL.md (required for create, optional for edit)"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "Text to find for replacement (used with edit)"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "Replacement text (used with edit)"
                    }
                },
                "required": ["action"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    def _get_skill_path(self, name: str) -> Path:
        return self.SKILLS_DIR / name

    def _get_skill_md(self, name: str) -> Path:
        return self._get_skill_path(name) / "SKILL.md"

    def _parse_description(self, skill_md: Path) -> str:
        """Extract the first meaningful line from SKILL.md as description."""
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        return line[:120]
        except Exception:
            pass
        return ""

    async def _action_list(self) -> ToolResult:
        skills: List[Dict[str, str]] = []
        if not self.SKILLS_DIR.exists():
            return ToolResult(success=True, data=skills, metadata={"total": 0})

        for entry in sorted(self.SKILLS_DIR.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            skill_md = entry / "SKILL.md"
            if skill_md.exists():
                desc = self._parse_description(skill_md)
                skills.append({
                    "name": entry.name,
                    "description": desc,
                    "path": str(entry)
                })

        return ToolResult(
            success=True,
            data=skills,
            metadata={"total": len(skills), "skills_dir": str(self.SKILLS_DIR)}
        )

    async def _action_view(self, name: str) -> ToolResult:
        skill_md = self._get_skill_md(name)
        if not skill_md.exists():
            return ToolResult(
                success=False,
                error=f"Skill '{name}' not found or missing SKILL.md"
            )
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                content = f.read()
            return ToolResult(
                success=True,
                data=content,
                metadata={"name": name, "path": str(skill_md), "size": len(content)}
            )
        except Exception as e:
            return ToolResult(success=False, error=f"Read error: {str(e)}")

    async def _action_create(self, name: str, content: str) -> ToolResult:
        skill_path = self._get_skill_path(name)
        if skill_path.exists():
            return ToolResult(
                success=False,
                error=f"Skill '{name}' already exists at {skill_path}"
            )
        try:
            skill_path.mkdir(parents=True, exist_ok=True)
            skill_md = skill_path / "SKILL.md"
            with open(skill_md, "w", encoding="utf-8") as f:
                f.write(content or "")
            return ToolResult(
                success=True,
                data={"name": name, "path": str(skill_path)},
                metadata={"message": f"Skill '{name}' created successfully"}
            )
        except Exception as e:
            # Clean up partial creation
            if skill_path.exists():
                shutil.rmtree(skill_path, ignore_errors=True)
            return ToolResult(success=False, error=f"Create error: {str(e)}")

    async def _action_edit(
        self,
        name: str,
        content: str = "",
        old_string: str = "",
        new_string: str = ""
    ) -> ToolResult:
        skill_md = self._get_skill_md(name)
        if not skill_md.exists():
            return ToolResult(
                success=False,
                error=f"Skill '{name}' not found or missing SKILL.md"
            )
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                current = f.read()

            if old_string is not None and new_string is not None and old_string != "":
                if old_string not in current:
                    return ToolResult(
                        success=False,
                        error=f"old_string not found in {skill_md}"
                    )
                new_content = current.replace(old_string, new_string, 1)
            elif content is not None and content != "":
                new_content = content
            else:
                return ToolResult(
                    success=False,
                    error="Edit requires either 'content' or both 'old_string' and 'new_string'"
                )

            with open(skill_md, "w", encoding="utf-8") as f:
                f.write(new_content)

            return ToolResult(
                success=True,
                data={"name": name, "path": str(skill_md)},
                metadata={"message": f"Skill '{name}' updated successfully"}
            )
        except Exception as e:
            return ToolResult(success=False, error=f"Edit error: {str(e)}")

    async def _action_delete(self, name: str) -> ToolResult:
        skill_path = self._get_skill_path(name)
        if not skill_path.exists():
            return ToolResult(
                success=False,
                error=f"Skill '{name}' not found"
            )
        try:
            self.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            backup_path = self.BACKUP_DIR / f"{name}"
            # If a previous backup exists, append a counter
            if backup_path.exists():
                counter = 1
                while self.BACKUP_DIR / f"{name}_{counter}":
                    counter += 1
                backup_path = self.BACKUP_DIR / f"{name}_{counter}"
            shutil.move(str(skill_path), str(backup_path))
            return ToolResult(
                success=True,
                data={"name": name, "backup_path": str(backup_path)},
                metadata={"message": f"Skill '{name}' moved to backup"}
            )
        except Exception as e:
            return ToolResult(success=False, error=f"Delete error: {str(e)}")

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")
        name = parameters.get("name", "")
        content = parameters.get("content")
        old_string = parameters.get("old_string")
        new_string = parameters.get("new_string")

        if action == "list":
            return await self._action_list()
        elif action == "view":
            if not name:
                return ToolResult(success=False, error="'name' is required for view")
            return await self._action_view(name)
        elif action == "create":
            if not name:
                return ToolResult(success=False, error="'name' is required for create")
            return await self._action_create(name, content or "")
        elif action == "edit":
            if not name:
                return ToolResult(success=False, error="'name' is required for edit")
            return await self._action_edit(
                name,
                content=content or "",
                old_string=old_string or "",
                new_string=new_string or ""
            )
        elif action == "delete":
            if not name:
                return ToolResult(success=False, error="'name' is required for delete")
            return await self._action_delete(name)
        else:
            return ToolResult(
                success=False,
                error=f"Unknown action: '{action}'. Valid: list, view, create, edit, delete"
            )
