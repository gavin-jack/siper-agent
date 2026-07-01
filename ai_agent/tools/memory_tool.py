"""
Memory Tool - Read/write persistent key-value memory using SQLite.

Storage: SQLite database per agent at ~/.siper/agents/<name>/memory.db
- WAL mode for concurrent read/write
- FTS5 full-text search on keys and values
- TTL support with auto-cleanup
"""
import sqlite3
import time as _time
from pathlib import Path
from typing import Dict, Any, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


def _get_db_path(agent_name: str = "default") -> Path:
    db_dir = Path.home() / ".siper" / "agents" / agent_name / "memory"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "memory.db"


def _get_connection(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=10)
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
    return conn


def _cleanup_expired(conn: sqlite3.Connection, target: str):
    now = _time.time()
    conn.execute(
        "DELETE FROM memory WHERE target = ? AND ttl > 0 AND created_at + ttl < ?",
        (target, now)
    )
    conn.commit()


class MemoryTool(BaseTool):
    """Persistent key-value memory storage using SQLite with FTS5 search and TTL."""

    def __init__(self):
        super().__init__(
            name="memory",
            description=(
                "Read, write, and search persistent key-value memory across sessions.\n\n"
                "When to use:\n"
                "- Remembering user preferences, habits, or personal details\n"
                "- Storing project conventions, API quirks, or tool gotchas\n"
                "- Saving facts that should persist across conversations\n"
                "- Use target='user' for user profile, target='memory' for agent notes\n\n"
                "Actions:\n"
                "- 'read': get value by key\n"
                "- 'write': store key-value pair\n"
                "- 'list': list all keys and values\n"
                "- 'delete': remove a key\n"
                "- 'search': full-text search on keys and values (FTS5)\n\n"
                "Parameters:\n"
                "- action: operation to perform (required)\n"
                "- key: memory key (required for read/write/delete/search)\n"
                "- value: value to store (required for write)\n"
                "- target: 'memory' (default) or 'user'\n"
                "- agent_name: agent isolation (default: 'default')\n"
                "- ttl: time-to-live in seconds (optional, e.g., 86400 for 1 day)\n\n"
                "Returns: value for read, confirmation for write/delete, key-value list for list/search\n\n"
                "Storage: SQLite (WAL mode) at ~/.siper/agents/<name>/memory.db"
            ),
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "'read', 'write', 'list', 'delete', or 'search'",
                        "enum": ["read", "write", "list", "delete", "search"]
                    },
                    "key": {"type": "string", "description": "Memory key (required for read/write/delete/search)"},
                    "value": {"type": "string", "description": "Value to store (required for write)"},
                    "target": {"type": "string", "description": "'memory' (default) or 'user'", "default": "memory"},
                    "agent_name": {"type": "string", "description": "Agent name for isolation (default: 'default')", "default": "default"},
                    "ttl": {"type": "integer", "description": "Time-to-live in seconds. E.g., 86400 = 1 day.", "default": 0},
                },
                "required": ["action"]
            },
            toolsets=["memory", "core"],
            category=ToolCategory.DATA,
        )

    def check_fn(self):
        try:
            db_path = _get_db_path("default")
            conn = _get_connection(db_path)
            conn.execute("SELECT COUNT(*) FROM memory")
            conn.close()
            return True
        except Exception:
            return False

    def _get_conn(self, agent_name: str = "default") -> sqlite3.Connection:
        db_path = _get_db_path(agent_name)
        return _get_connection(db_path)

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")
        key = parameters.get("key", "")
        value = parameters.get("value", "")
        target = parameters.get("target", "memory")
        agent_name = parameters.get("agent_name", "default")
        ttl = parameters.get("ttl", 0)

        conn = None
        try:
            conn = self._get_conn(agent_name)

            if action == "read":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                _cleanup_expired(conn, target)
                row = conn.execute("SELECT value FROM memory WHERE key = ? AND target = ?", (key, target)).fetchone()
                if not row:
                    return ToolResult(success=True, data=f"(键 '{key}' 不存在)", metadata={"key": key, "target": target, "agent": agent_name, "found": False})
                return ToolResult(success=True, data=row[0], metadata={"key": key, "target": target, "agent": agent_name, "found": True})

            elif action == "write":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                now = _time.time()
                ttl_val = int(ttl) if ttl else 0
                conn.execute(
                    """INSERT INTO memory (key, value, target, created_at, updated_at, ttl)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET value=excluded.value, target=excluded.target,
                       updated_at=excluded.updated_at, ttl=excluded.ttl""",
                    (key, value, target, now, now, ttl_val)
                )
                conn.commit()
                display_val = value[:50] + "..." if len(value) > 50 else value
                return ToolResult(success=True, data=f"已存储 '{key}' = '{display_val}'" + (f" (TTL: {ttl_val}s)" if ttl_val > 0 else ""), metadata={"key": key, "target": target, "agent": agent_name})

            elif action == "list":
                _cleanup_expired(conn, target)
                rows = conn.execute("SELECT key, value FROM memory WHERE target = ? ORDER BY updated_at DESC", (target,)).fetchall()
                if not rows:
                    return ToolResult(success=True, data=f"(agent '{target}' 中没有记忆)", metadata={"target": target, "agent": agent_name, "count": 0})
                lines = [f"  {k}: {v[:80]}" for k, v in rows]
                return ToolResult(success=True, data="\n".join(lines), metadata={"target": target, "agent": agent_name, "count": len(rows)})

            elif action == "search":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数（搜索关键词）")
                _cleanup_expired(conn, target)
                try:
                    rows = conn.execute(
                        """SELECT m.key, m.value FROM memory_fts f
                           JOIN memory m ON m.rowid = memory_fts.rowid
                           WHERE memory_fts MATCH ? AND m.target = ?""",
                        (key, target)
                    ).fetchall()
                except sqlite3.OperationalError:
                    pattern = f"%{key}%"
                    rows = conn.execute(
                        "SELECT key, value FROM memory WHERE target = ? AND (key LIKE ? OR value LIKE ?)",
                        (target, pattern, pattern)
                    ).fetchall()
                if not rows:
                    return ToolResult(success=True, data=f"未找到包含 '{key}' 的记忆", metadata={"query": key, "target": target, "agent": agent_name, "count": 0})
                lines = [f"  {k}: {v[:80]}" for k, v in rows]
                return ToolResult(success=True, data="\n".join(lines), metadata={"query": key, "target": target, "agent": agent_name, "count": len(rows)})

            elif action == "delete":
                if not key:
                    return ToolResult(success=False, error="缺少 'key' 参数")
                cursor = conn.execute("DELETE FROM memory WHERE key = ? AND target = ?", (key, target))
                conn.commit()
                if cursor.rowcount > 0:
                    return ToolResult(success=True, data=f"已从 '{target}' 删除 '{key}'", metadata={"key": key, "target": target, "agent": agent_name, "found": True})
                return ToolResult(success=True, data=f"键 '{key}' 在 '{target}' 中不存在", metadata={"key": key, "target": target, "agent": agent_name, "found": False})

            else:
                return ToolResult(success=False, error=f"未知操作：{action}")
        except Exception as e:
            return ToolResult(success=False, error=f"记忆操作出错：{str(e)}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
