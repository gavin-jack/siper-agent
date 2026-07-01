"""
Session Search Tool - Search historical sessions with full-text search.

When to use:
- Looking for past conversations by topic, keyword, or content
- Finding specific discussions, decisions, or code snippets from history
- Use mode='search' for keyword search (default)
- Use mode='recent' for listing recent sessions without keyword
- Use mode='browse' for browsing all sessions chronologically

Features:
- Full-text search (FTS5) on message content, not just session context
- Falls back to LIKE query if FTS5 is not available
- Results ranked by relevance (FTS5 bm25) or recency
- Returns snippets with highlighted match context
"""
import json
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


def _get_db_path() -> Optional[Path]:
    """Find sessions.db in possible locations."""
    candidates = [
        Path.home() / ".siper" / "agents" / "default" / "sessions" / "sessions.db",
        Path.home() / ".siper" / "agents" / "default" / "sessions.db",
        Path.home() / ".siper" / "sessions.db",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _ensure_fts5(conn: sqlite3.Connection) -> bool:
    """Create FTS5 virtual table for messages if not exists. Returns True if FTS5 is available."""
    try:
        # Check if FTS5 table exists
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'"
        )
        if cursor.fetchone():
            return True

        # Create FTS5 virtual table
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                session_id UNINDEXED,
                role UNINDEXED,
                timestamp UNINDEXED,
                content=messages,
                content_rowid=rowid
            )
        """)

        # Populate from existing messages
        conn.execute("""
            INSERT INTO messages_fts(rowid, content, session_id, role, timestamp)
            SELECT rowid, content, session_id, role, timestamp FROM messages
            WHERE role IN ('user', 'assistant')
        """)

        conn.commit()
        return True
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        # FTS5 not available
        return False


def _search_fts5(conn: sqlite3.Connection, query: str, limit: int) -> List[Dict]:
    """Search using FTS5 full-text search with bm25 ranking."""
    # Sanitize query for FTS5
    safe_query = query.replace('"', '').replace("'", "").replace('(', '').replace(')', '')
    if not safe_query.strip():
        return []

    try:
        # Use FTS5 with bm25 ranking (lower = better)
        cursor = conn.execute("""
            SELECT m.session_id, m.role, m.content, m.timestamp,
                   s.title, s.created_at,
                   bm25(messages_fts) as rank
            FROM messages_fts
            JOIN messages m ON m.rowid = messages_fts.rowid
            LEFT JOIN sessions s ON s.session_id = m.session_id
            WHERE messages_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (safe_query, limit))

        results = []
        seen_sessions = set()
        for row in cursor.fetchall():
            session_id = row[0]
            content = row[2] or ""
            # Extract snippet around match (first 200 chars)
            snippet = content[:300] + "..." if len(content) > 300 else content
            title = row[4] or session_id[:12]
            results.append({
                "session_id": session_id,
                "title": title,
                "role": row[1],
                "snippet": snippet,
                "timestamp": row[3] or row[5] or "",
                "rank": row[6]
            })
            seen_sessions.add(session_id)

        return results
    except sqlite3.OperationalError:
        return []


def _search_like(conn: sqlite3.Connection, query: str, limit: int) -> List[Dict]:
    """Fallback: search using LIKE on message content."""
    cursor = conn.execute("""
        SELECT m.session_id, m.role, m.content, m.timestamp,
               s.title, s.created_at
        FROM messages m
        LEFT JOIN sessions s ON s.session_id = m.session_id
        WHERE m.content LIKE ? AND m.role IN ('user', 'assistant')
        ORDER BY m.timestamp DESC
        LIMIT ?
    """, (f"%{query}%", limit))

    results = []
    for row in cursor.fetchall():
        content = row[2] or ""
        snippet = content[:300] + "..." if len(content) > 300 else content
        title = row[4] or row[0][:12]
        results.append({
            "session_id": row[0],
            "title": title,
            "role": row[1],
            "snippet": snippet,
            "timestamp": row[3] or row[5] or "",
            "rank": None
        })
    return results


def _get_recent_sessions(conn: sqlite3.Connection, limit: int) -> List[Dict]:
    """Get recent sessions with last message preview."""
    cursor = conn.execute("""
        SELECT s.session_id, s.title, s.created_at,
               (SELECT m.content FROM messages m
                WHERE m.session_id = s.session_id
                AND m.role = 'assistant'
                ORDER BY m.timestamp DESC LIMIT 1) as last_msg
        FROM sessions s
        ORDER BY s.created_at DESC
        LIMIT ?
    """, (limit,))

    results = []
    for row in cursor.fetchall():
        content = row[3] or ""
        snippet = content[:200] + "..." if len(content) > 200 else content
        results.append({
            "session_id": row[0],
            "title": row[1] or row[0][:12],
            "role": "assistant",
            "snippet": snippet,
            "timestamp": row[2] or "",
            "rank": None
        })
    return results


class SessionSearchTool(BaseTool):
    """Search historical sessions with full-text search on message content.

    Supports three modes:
    - 'search': keyword/FTS5 search (default)
    - 'recent': list recent sessions
    - 'browse': browse all sessions
    """

    def __init__(self):
        super().__init__(
            name="session_search",
            description=(
                "Search historical conversation sessions.\n\n"
                "When to use:\n"
                "- Looking for past discussions, decisions, or code from history\n"
                "- Finding specific topics or keywords in previous conversations\n"
                "- mode='recent' to list recent sessions without keyword\n"
                "- mode='browse' to browse all sessions chronologically\n\n"
                "Parameters:\n"
                "- query: search keyword/phrase (optional for recent/browse modes)\n"
                "- mode: 'search' (default), 'recent', or 'browse'\n"
                "- limit: max results (default: 5, max: 20)\n\n"
                "Returns: list of sessions with title, snippet, timestamp, and relevance rank\n\n"
                "Note: Uses SQLite FTS5 for full-text search when available. "
                "Searches message content, not just session titles. "
                "Results ranked by relevance (FTS5 bm25) or by recency."
            ),
            schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword or phrase. Optional for mode='recent' or mode='browse'.",
                        "default": ""
                    },
                    "mode": {
                        "type": "string",
                        "description": "'search' for keyword search (default), 'recent' for recent sessions, 'browse' for all sessions",
                        "default": "search"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5, max: 20)",
                        "default": 5
                    }
                },
                "required": []
            },
            toolsets=["memory", "core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        query = parameters.get("query", "").strip()
        mode = parameters.get("mode", "search")
        limit = max(1, min(int(parameters.get("limit", 5)), 20))

        db_path = _get_db_path()
        if not db_path:
            return ToolResult(
                success=False,
                error="No sessions database found. Start a conversation first."
            )

        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row

            if mode == "recent":
                results = _get_recent_sessions(conn, limit)
            elif mode == "browse":
                results = _get_recent_sessions(conn, limit * 2)
            elif mode == "search":
                if not query:
                    return ToolResult(
                        success=False,
                        error="query parameter is required for mode='search'"
                    )
                # Try FTS5 first, fall back to LIKE
                fts5_available = _ensure_fts5(conn)
                if fts5_available:
                    results = _search_fts5(conn, query, limit)
                else:
                    results = _search_like(conn, query, limit)
            else:
                return ToolResult(
                    success=False,
                    error=f"Unknown mode: {mode}. Use 'search', 'recent', or 'browse'."
                )

            conn.close()

            return ToolResult(
                success=True,
                data=results,
                metadata={
                    "count": len(results),
                    "mode": mode,
                    "query": query,
                    "db_path": str(db_path)
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Session search failed: {str(e)}"
            )
