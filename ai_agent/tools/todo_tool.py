"""
Todo Tool - Manage a persistent task list stored in JSON.
"""

import json
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime

from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_TODO_FILE = _PROJECT_ROOT / "agents" / "default" / "todos.json"


def _load_todos() -> List[Dict[str, Any]]:
    if not _TODO_FILE.exists():
        return []
    try:
        with open(_TODO_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except (json.JSONDecodeError, IOError):
        return []


def _save_todos(todos: List[Dict[str, Any]]):
    _TODO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_TODO_FILE, "w", encoding="utf-8") as f:
        json.dump(todos, f, ensure_ascii=False, indent=2)


def _next_id(todos: List[Dict[str, Any]]) -> str:
    max_num = 0
    for t in todos:
        tid = t.get("id", "")
        if tid.startswith("todo_"):
            try:
                num = int(tid.split("_")[1])
                if num > max_num:
                    max_num = num
            except (IndexError, ValueError):
                pass
    return f"todo_{max_num + 1}"


class TodoTool(BaseTool):
    """Manage a persistent todo list stored in a JSON file."""

    def __init__(self):
        super().__init__(
            name="todo",
            description="管理任务列表。支持 add/update/complete/list/clear 操作。持久化到 JSON 文件。",
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["add", "update", "complete", "list", "clear"],
                        "description": "操作类型：add（添加）、update（更新）、complete（完成）、list（列出）、clear（清空）"
                    },
                    "id": {
                        "type": "string",
                        "description": "任务 ID，update/complete 时必填"
                    },
                    "content": {
                        "type": "string",
                        "description": "任务内容，add/update 时使用"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "cancelled"],
                        "description": "任务状态，update 时使用"
                    }
                },
                "required": ["action"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")

        try:
            if action == "add":
                return self._do_add(parameters)
            elif action == "update":
                return self._do_update(parameters)
            elif action == "complete":
                return self._do_complete(parameters)
            elif action == "list":
                return self._do_list()
            elif action == "clear":
                return self._do_clear()
            else:
                return ToolResult(
                    success=False,
                    error=f"未知操作：{action}。支持的操作：add, update, complete, list, clear"
                )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"执行出错：{str(e)}"
            )

    def _do_add(self, parameters: Dict[str, Any]) -> ToolResult:
        content = parameters.get("content", "").strip()
        if not content:
            return ToolResult(success=False, error="content 不能为空")

        todos = _load_todos()
        new_id = _next_id(todos)
        now = datetime.now().isoformat()
        todo = {
            "id": new_id,
            "content": content,
            "status": "pending",
            "created_at": now,
            "updated_at": now
        }
        todos.append(todo)
        _save_todos(todos)
        return ToolResult(success=True, data=todos)

    def _do_update(self, parameters: Dict[str, Any]) -> ToolResult:
        todo_id = parameters.get("id", "").strip()
        if not todo_id:
            return ToolResult(success=False, error="id 不能为空")

        todos = _load_todos()
        for t in todos:
            if t.get("id") == todo_id:
                if "content" in parameters:
                    content = parameters["content"].strip()
                    if content:
                        t["content"] = content
                if "status" in parameters:
                    t["status"] = parameters["status"]
                t["updated_at"] = datetime.now().isoformat()
                _save_todos(todos)
                return ToolResult(success=True, data=todos)

        return ToolResult(success=False, error=f"未找到任务：{todo_id}")

    def _do_complete(self, parameters: Dict[str, Any]) -> ToolResult:
        todo_id = parameters.get("id", "").strip()
        if not todo_id:
            return ToolResult(success=False, error="id 不能为空")

        todos = _load_todos()
        for t in todos:
            if t.get("id") == todo_id:
                t["status"] = "completed"
                t["updated_at"] = datetime.now().isoformat()
                _save_todos(todos)
                return ToolResult(success=True, data=todos)

        return ToolResult(success=False, error=f"未找到任务：{todo_id}")

    def _do_list(self) -> ToolResult:
        todos = _load_todos()
        return ToolResult(success=True, data=todos)

    def _do_clear(self) -> ToolResult:
        _save_todos([])
        return ToolResult(success=True, data=[])
