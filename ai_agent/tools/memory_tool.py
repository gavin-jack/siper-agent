"""
Memory Tool - Read/write persistent key-value memory.
Supports multi-agent isolation via agent_name parameter.
"""

import json
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class MemoryTool(BaseTool):
    """Persistent key-value memory storage using JSON file."""

    def __init__(self):
        super().__init__(
            name="memory",
            description="Read and write persistent memory (key-value pairs). Use this to remember facts, preferences, and context across sessions.",
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "'read' to get a value, 'write' to set, 'list' to see all keys, 'delete' to remove",
                        "enum": ["read", "write", "list", "delete"]
                    },
                    "key": {
                        "type": "string",
                        "description": "Memory key (required for read/write/delete)"
                    },
                    "value": {
                        "type": "string",
                        "description": "Value to store (required for write)"
                    },
                    "target": {
                        "type": "string",
                        "description": "'memory' for agent notes, 'user' for user profile (default: memory)",
                        "default": "memory"
                    },
                    "agent_name": {
                        "type": "string",
                        "description": "Agent name for multi-agent isolation (default: 'default'). Each agent has its own memory space.",
                        "default": "default"
                    }
                },
                "required": ["action"]
            },
            toolsets=["memory", "core"],
            category=ToolCategory.DATA
        )

    def check_fn(self):
        """检查记忆存储目录是否可写。"""
        try:
            mem_dir = Path.home() / ".siper" / "agents" / "default" / "memory"
            mem_dir.mkdir(parents=True, exist_ok=True)
            test_file = mem_dir / ".write_test"
            test_file.write_text("ok")
            test_file.unlink()
            return True
        except Exception:
            return False

    def _memory_path(self, target: str, agent_name: str = "default") -> Path:
        """Get the memory file path for a target, with agent isolation."""
        base = Path.home() / ".siper" / "agents" / agent_name / "memory"
        base.mkdir(parents=True, exist_ok=True)
        return base / f"{target}.json"

    def _load_memory(self, target: str, agent_name: str = "default") -> Dict[str, str]:
        """Load memory from file."""
        path = self._memory_path(target, agent_name)
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {}
        return {}

    def _save_memory(self, target: str, data: Dict[str, str], agent_name: str = "default"):
        """Save memory to file."""
        path = self._memory_path(target, agent_name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")
        key = parameters.get("key", "")
        value = parameters.get("value", "")
        target = parameters.get("target", "memory")
        agent_name = parameters.get("agent_name", "default")

        try:
            if action == "read":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                memory = self._load_memory(target, agent_name)
                if key not in memory:
                    return ToolResult(
                        success=True,
                        data=f"(键 '{key}' 不存在)",
                        metadata={"key": key, "target": target, "agent": agent_name, "found": False}
                    )
                return ToolResult(
                    success=True,
                    data=memory[key],
                    metadata={"key": key, "target": target, "agent": agent_name, "found": True}
                )

            elif action == "write":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                memory = self._load_memory(target, agent_name)
                memory[key] = value
                self._save_memory(target, memory, agent_name)
                display_val = value[:50] + "..." if len(value) > 50 else value
                return ToolResult(
                    success=True,
                    data=f"已存储 '{key}' = '{display_val}'",
                    metadata={"key": key, "target": target, "agent": agent_name}
                )

            elif action == "list":
                memory = self._load_memory(target, agent_name)
                if not memory:
                    return ToolResult(
                        success=True,
                        data=f"(agent '{target}' 中没有记忆)",
                        metadata={"target": target, "agent": agent_name, "count": 0}
                    )
                lines = [f"  {k}: {v[:80]}" for k, v in memory.items()]
                return ToolResult(
                    success=True,
                    data="\n".join(lines),
                    metadata={"target": target, "agent": agent_name, "count": len(memory)}
                )

            elif action == "delete":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                memory = self._load_memory(target, agent_name)
                if key in memory:
                    del memory[key]
                    self._save_memory(target, memory, agent_name)
                    return ToolResult(
                        success=True,
                        data=f"已从 '{target}' 删除 '{key}'",
                        metadata={"key": key, "target": target, "agent": agent_name, "found": True}
                    )
                return ToolResult(
                    success=True,
                    data=f"键 '{key}' 在 '{target}' 中不存在",
                    metadata={"key": key, "target": target, "agent": agent_name, "found": False}
                )

            else:
                return ToolResult(success=False, error=f"未知操作：{action}")
        except Exception as e:
            return ToolResult(success=False, error=f"记忆操作出错：{str(e)}")
