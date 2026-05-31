"""Agent configuration management package."""

from pathlib import Path
from typing import Dict, Optional
import json


AGENTS_DIR = Path(__file__).parent


def _ensure_agent_files(name: str) -> None:
    """Ensure default soul.md and agent.md exist for an agent. Generates minimal defaults if missing."""
    agent_dir = AGENTS_DIR / name
    if not agent_dir.is_dir():
        return
    soul_file = agent_dir / "soul.md"
    if not soul_file.exists():
        soul_file.write_text(
            "# SOUL.md - " + name + "\n\n"
            "## Identity\n- Name: " + name + "\n\n"
            "## Language\n- Respond in Chinese (中文) by default\n",
            encoding="utf-8",
        )
    config_file = agent_dir / "agent.md"
    if not config_file.exists():
        config_file.write_text(
            "# Agent Configuration - " + name + "\n\n"
            "## System Prompt\n你是一个高级 AI 助手 " + name + "。\n"
            "1. 清晰理解用户需求\n"
            "2. 在需要时使用合适的工具\n"
            "3. 提供有用、准确的回复\n\n"
            "## Response Format\n- 简洁中文回复\n- 工具调用结果格式化展示\n",
            encoding="utf-8",
        )


def list_agents() -> list:
    """List all available agent names (subdirectories). Auto-generates soul.md/agent.md if missing."""
    agents = []
    for item in AGENTS_DIR.iterdir():
        if item.is_dir() and not item.name.startswith("_") and not item.name.startswith("."):
            _ensure_agent_files(item.name)
            agents.append(item.name)
    return sorted(agents)


def get_agent_dir(name: str) -> Optional[Path]:
    """Get the directory path for a named agent (auto-generates soul.md/agent.md if missing)."""
    agent_dir = AGENTS_DIR / name
    if agent_dir.is_dir():
        _ensure_agent_files(name)
        return agent_dir
    return None


def load_agent_soul(name: str) -> str:
    """Load soul.md for a named agent."""
    agent_dir = get_agent_dir(name)
    if agent_dir:
        soul_file = agent_dir / "soul.md"
        if soul_file.exists():
            return soul_file.read_text(encoding="utf-8")
    return ""


def load_agent_config(name: str) -> str:
    """Load agent.md for a named agent."""
    agent_dir = get_agent_dir(name)
    if agent_dir:
        config_file = agent_dir / "agent.md"
        if config_file.exists():
            return config_file.read_text(encoding="utf-8")
    return ""


def load_agent_memory(name: str) -> str:
    """Load memory.md for a named agent."""
    agent_dir = get_agent_dir(name)
    if agent_dir:
        memory_file = agent_dir / "memory.md"
        if memory_file.exists():
            return memory_file.read_text(encoding="utf-8")
    return ""


def save_agent_file(name: str, file_type: str, content: str) -> bool:
    """Save a file (soul/agent/memory) for a named agent.
    
    Args:
        name: agent name
        file_type: one of 'soul', 'config', 'memory'
        content: file content to write
    
    Returns:
        True if saved successfully
    """
    agent_dir = get_agent_dir(name)
    if not agent_dir:
        return False
    
    file_map = {
        "soul": "soul.md",
        "config": "agent.md",
        "memory": "memory.md",
    }
    
    filename = file_map.get(file_type)
    if not filename:
        return False
    
    target = agent_dir / filename
    backup = agent_dir / (filename + ".bak")
    
    try:
        # Reject empty content to prevent accidental data loss
        if content is None or (isinstance(content, str) and content.strip() == ""):
            return False
        if target.exists():
            backup.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
        target.write_text(content, encoding="utf-8")
        return True
    except Exception:
        return False


def load_agent_config_file(name: str) -> dict:
    """Load config.json for a named agent (models, icon, avatar, display_name, etc.).
    
    Returns:
        dict with keys: name, icon, avatar, models, default_model, etc.
        Empty dict if not found.
    """
    agent_dir = get_agent_dir(name)
    if not agent_dir:
        return {}
    # Prefer config.json, fall back to meta.json for backward compatibility
    for fname in ("config.json", "meta.json"):
        cfg_path = agent_dir / fname
        if cfg_path.exists():
            try:
                return json.loads(cfg_path.read_text(encoding="utf-8"))
            except Exception:
                pass
    return {}


def save_agent_config_file(name: str, data: dict) -> bool:
    """Save config.json for a named agent.
    
    Args:
        name: agent name
        data: dict with any of name, icon, avatar, models, default_model
    
    Returns:
        True if saved successfully
    """
    agent_dir = get_agent_dir(name)
    if not agent_dir:
        return False
    
    cfg_path = agent_dir / "config.json"
    
    try:
        # Merge with existing config
        existing = {}
        if cfg_path.exists():
            try:
                existing = json.loads(cfg_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        existing.update(data)
        # Backup before write
        backup = cfg_path.with_suffix(".json.bak")
        if cfg_path.exists():
            backup.write_text(cfg_path.read_text(encoding="utf-8"), encoding="utf-8")
        cfg_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
        return True
    except Exception:
        return False


def get_agent_info(name: str) -> Optional[dict]:
    """Get comprehensive info about an agent including file availability."""
    agent_dir = get_agent_dir(name)
    if not agent_dir:
        return None

    # Load config.json (or meta.json for backward compat)
    cfg = load_agent_config_file(name)

    return {
        "name": name,
        "display_name": cfg.get("display_name", cfg.get("name", name)),
        "icon": cfg.get("icon", "🎭"),
        "avatar": cfg.get("avatar", ""),
        "has_soul": (agent_dir / "soul.md").exists(),
        "has_config": (agent_dir / "agent.md").exists(),
        "has_memory": (agent_dir / "memory.md").exists(),
        "models": cfg.get("models", []),
        "default_model": cfg.get("default_model", ""),
        "session_timeout": cfg.get("session_timeout", 3600),
        "max_tools": cfg.get("max_tools", 300),
        "max_tool_rounds": cfg.get("max_tool_rounds", 100),
        "appearance": cfg.get("appearance", {}),
    }


__all__ = [
    "AGENTS_DIR",
    "list_agents",
    "get_agent_dir",
    "load_agent_soul",
    "load_agent_config",
    "load_agent_memory",
    "save_agent_file",
    "load_agent_config_file",
    "save_agent_config_file",
    "get_agent_info",
]
