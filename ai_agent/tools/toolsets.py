"""
Toolsets Module — flexible system for defining and managing tool groups.

Toolsets allow grouping tools together for specific scenarios.
"""

from typing import List, Dict, Any, Set


# Core toolset definitions
TOOLSETS: Dict[str, Dict[str, Any]] = {
    # Core toolset — fundamental tools available in all toolsets
    "core": {
        "description": "Core tools — file ops, terminal, memory, search, skills, planning",
        "tools": [],
        "includes": ["file", "terminal", "memory", "skills", "planning", "communication", "vision"],
    },
    # Basic toolsets
    "web": {
        "description": "Web search and content extraction",
        "tools": ["web_search", "web_fetch", "browser_navigate"],
        "includes": [],
    },
    "search": {
        "description": "Web search only",
        "tools": ["web_search"],
        "includes": [],
    },
    "file": {
        "description": "File manipulation tools",
        "tools": ["read_file", "write_file", "search_files", "list_dir", "patch"],
        "includes": [],
    },
    "terminal": {
        "description": "Terminal/command execution",
        "tools": ["execute_command", "execute_code"],
        "includes": [],
    },
    "memory": {
        "description": "Persistent memory and session search",
        "tools": ["memory", "session_search"],
        "includes": [],
    },
    "browser": {
        "description": "Browser automation",
        "tools": ["browser_navigate"],
        "includes": [],
    },
    "vision": {
        "description": "Image analysis and generation",
        "tools": ["vision_analyze", "image_generate"],
        "includes": [],
    },
    "skills": {
        "description": "Skill management",
        "tools": ["skills_list", "skill_view", "skill_manage"],
        "includes": [],
    },
    "communication": {
        "description": "Messaging and notifications",
        "tools": ["send_message", "text_to_speech"],
        "includes": [],
    },
    "planning": {
        "description": "Task planning and delegation",
        "tools": ["todo", "clarify", "delegate_task", "cronjob"],
        "includes": [],
    },
    # Scenario-specific toolsets
    "full": {
        "description": "All tools",
        "tools": [],
        "includes": ["web", "file", "terminal", "memory", "browser", "vision", "skills", "communication", "planning"],
    },
    "safe": {
        "description": "Safe toolkit without terminal",
        "tools": ["web_search", "web_fetch"],
        "includes": ["file", "memory", "vision", "skills"],
    },
}


def resolve_toolset(name: str, _visited: Set[str] = None) -> List[str]:
    """Resolve a toolset to a flat list of tool names."""
    if _visited is None:
        _visited = set()
    if name in _visited:
        return []
    _visited.add(name)

    ts = TOOLSETS.get(name)
    if ts is None:
        return []

    tools = list(ts.get("tools", []))
    for inc in ts.get("includes", []):
        tools.extend(resolve_toolset(inc, _visited))
    return list(dict.fromkeys(tools))  # dedupe preserving order


def get_all_toolsets() -> Dict[str, str]:
    """Get all toolset names and descriptions."""
    return {name: ts["description"] for name, ts in TOOLSETS.items()}
