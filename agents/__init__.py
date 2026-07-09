"""
Agents package — per-agent config, soul, memory management.

Runtime data (sessions.db, config.json, soul.md) is gitignored
but required for startup. This package loads/saves them.
Sessions are stored in sessions/sessions.db under each agent directory.
Memory is stored in memory/memory.db under each agent directory.
Skill data is shared globally in agents/ root (skill_stats.json, skill_call_log.db).
"""

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = PROJECT_ROOT / "agents"


def _init_sessions_db(db_path: Path):
    """Create sessions.db with unified schema. Idempotent (safe to call if DB exists)."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            ended_at TEXT,
            context TEXT,
            metadata TEXT,
            title TEXT DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            tool_name TEXT,
            tool_call_id TEXT,
            meta TEXT DEFAULT '{}',
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
    conn.commit()
    conn.close()


def _init_memory_db(db_path: Path):
    """Create memory.db with unified schema. Idempotent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memory (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            target TEXT NOT NULL DEFAULT 'memory',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            ttl INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
            key, value, content=memory, content_rowid=rowid
        )
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
            INSERT INTO memory_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
            INSERT INTO memory_fts(memory_fts, rowid, key, value) VALUES ('delete', old.rowid, old.key, old.value);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
            INSERT INTO memory_fts(memory_fts, rowid, key, value) VALUES ('delete', old.rowid, old.key, old.value);
            INSERT INTO memory_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
        END
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memory_target ON memory(target)")
    conn.commit()
    conn.close()


def init_agent_db(name: str):
    """Initialize all per-agent databases with unified schema. Call after creating agent dir."""
    agent_dir = get_agent_dir(name)
    _init_sessions_db(agent_dir / "sessions" / "sessions.db")
    _init_memory_db(agent_dir / "memory" / "memory.db")


def get_agent_dir(name: str) -> Path:
    """Return the agent's data directory, creating it if needed.
    Rejects invalid names that would cause filesystem issues."""
    # 防止路径穿越和非法字符
    if not name or not re.match(r'^[a-zA-Z0-9_\-]+$', name):
        raise ValueError(f"Invalid agent name: {name!r}")
    agent_dir = AGENTS_DIR / name
    agent_dir.mkdir(parents=True, exist_ok=True)
    return agent_dir


def list_agents() -> List[str]:
    """List all agent names. Primary: config.db agent_configs table. Fallback: config.json files."""
    # Try config.db first
    try:
        from pathlib import Path as _Path
        from ai_agent.config_db import ConfigDB as _ConfigDB
        db = _ConfigDB(str(_Path(__file__).resolve().parent.parent / "data" / "config.db"))
        agents = db.list_agents()
        if agents:
            return agents
    except Exception:
        pass
    # Fallback: scan config.json files
    if not AGENTS_DIR.exists():
        return []
    return [
        d.name for d in AGENTS_DIR.iterdir()
        if d.is_dir() and (d / "config.json").exists()
    ]


def load_agent_config_file(name: str) -> Optional[Dict[str, Any]]:
    """Load agent config.json. Returns None if not found."""
    cfg_path = get_agent_dir(name) / "config.json"
    if cfg_path.exists():
        try:
            return json.loads(cfg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_agent_config_file(name: str, config: Dict[str, Any]) -> bool:
    """Save agent config.json. Returns True on success."""
    cfg_path = get_agent_dir(name) / "config.json"
    cfg_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def load_agent_config(name: str) -> Dict[str, Any]:
    """Load agent config, returning empty dict if not found."""
    return load_agent_config_file(name) or {}


def load_agent_soul(name: str) -> str:
    """Load agent soul.md content. Returns empty string if not found."""
    soul_path = get_agent_dir(name) / "soul.md"
    if soul_path.exists():
        return soul_path.read_text(encoding="utf-8")
    return ""


def load_agent_memory(name: str) -> str:
    """Load agent memory.md content. Returns empty string if not found."""
    # Check new location first
    mem_path = get_agent_dir(name) / "memory.md"
    if mem_path.exists():
        return mem_path.read_text(encoding="utf-8")
    # Check legacy memory/ directory
    mem_dir = get_agent_dir(name) / "memory"
    if mem_dir.exists():
        mem_file = mem_dir / "memory.json"
        if mem_file.exists():
            try:
                data = json.loads(mem_file.read_text(encoding="utf-8"))
                return data.get("content", "")
            except (json.JSONDecodeError, IOError):
                pass
    return ""


def save_agent_file(name: str, filename: str, content: str) -> None:
    """Save a text file to the agent's directory."""
    file_path = get_agent_dir(name) / filename
    file_path.write_text(content, encoding="utf-8")


def ensure_agent_avatar(name: str) -> None:
    """Ensure agent has an avatar. If none, copy the default Siper avatar (compressed to 256px PNG).

    Called after agent directory creation so every agent always has a visual identity.
    """
    import shutil as _shutil
    agent_dir = get_agent_dir(name)
    # Check if agent already has any avatar file
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if (agent_dir / f"avatar{ext}").exists():
            return
    # Also check config.json for avatar URL
    cfg = load_agent_config_file(name)
    if cfg and cfg.get("avatar"):
        return
    # Copy default avatar (prefer WebP, fallback to PNG)
    default_src = PROJECT_ROOT / "webui" / "static" / "default_avatar.webp"
    if not default_src.exists():
        default_src = PROJECT_ROOT / "webui" / "static" / "default_avatar.png"
    if default_src.exists():
        dest = agent_dir / "avatar.webp"
        _shutil.copy2(str(default_src), str(dest))
        # Update config.json with avatar path
        if cfg is None:
            cfg = {}
        cfg["avatar"] = f"agents/{name}/avatar.webp"
        save_agent_file(name, "config.json", __import__("json").dumps(cfg, ensure_ascii=False, indent=2))
