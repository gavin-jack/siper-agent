"""
Session Search Tool - Search historical session records by keyword.
"""

import json
import sqlite3
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class SessionSearchTool(BaseTool):
    """Search historical session records by keyword."""

    def __init__(self):
        super().__init__(
            name="session_search",
            description="搜索历史会话记录。按关键词查找过去的对话摘要。",
            schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回结果数量上限（默认5）",
                        "default": 5
                    }
                },
                "required": ["query"]
            },
            toolsets=["memory", "core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        query = parameters.get("query", "")
        limit = parameters.get("limit", 5)

        if not query:
            return ToolResult(
                success=False,
                error="缺少搜索关键词（query 参数为空）"
            )

        limit = max(1, min(int(limit), 50))

        try:
            db_path = Path.home() / ".siper" / "sessions.db"
            if db_path.exists():
                results = self._search_db(db_path, query, limit)
            else:
                results = self._search_json_files(query, limit)

            return ToolResult(
                success=True,
                data=results,
                metadata={"count": len(results)}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"搜索会话失败：{str(e)}"
            )

    def _search_db(self, db_path: Path, query: str, limit: int) -> list:
        """Search sessions from SQLite database."""
        results = []
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.execute(
                "SELECT session_id, created_at, context FROM sessions "
                "WHERE context LIKE ? "
                "ORDER BY created_at DESC LIMIT ?",
                (f"%{query}%", limit)
            )
            for row in cursor.fetchall():
                context_text = row["context"] or ""
                preview = context_text[:200] + "..." if len(context_text) > 200 else context_text
                results.append({
                    "id": row["session_id"],
                    "title": "",
                    "preview": preview,
                    "created_at": row["created_at"]
                })
        finally:
            conn.close()
        return results

    def _search_json_files(self, query: str, limit: int) -> list:
        """Search sessions from JSON files in data/sessions/ directory."""
        sessions_dir = Path.home() / ".siper" / "data" / "sessions"
        if not sessions_dir.exists():
            return []

        results = []
        query_lower = query.lower()

        for f in sorted(sessions_dir.glob("*.json"), reverse=True):
            if len(results) >= limit:
                break
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)

                title = data.get("title", "")
                content = data.get("content", "")
                created_at = data.get("created_at", "")

                if query_lower in title.lower() or query_lower in content.lower():
                    preview = content[:200] + "..." if len(content) > 200 else content
                    results.append({
                        "id": data.get("id", f.stem),
                        "title": title,
                        "preview": preview,
                        "created_at": created_at
                    })
            except (json.JSONDecodeError, OSError):
                continue

        return results[:limit]
