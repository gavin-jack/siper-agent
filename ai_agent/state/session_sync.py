"""
状态同步 — 从 DB/内存加载数据到快照
"""
import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ai_agent.state.snapshot_manager import SnapshotManager


def sync_sessions(snapshot_mgr: "SnapshotManager", agent) -> list:
    """从 DB 加载会话列表 → 返回 SessionSummary dict 列表"""
    sessions = []
    agents_dir = Path(os.path.dirname(__file__)).parent.parent / "agents"
    agent_dirs = [agents_dir / "default"]
    if agents_dir.exists():
        for d in agents_dir.iterdir():
            if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                agent_dirs.append(d)

    for agent_dir in agent_dirs:
        agent_name = agent_dir.name
        db_path = agent_dir / "sessions" / "sessions.db"
        if not db_path.exists():
            continue
        try:
            import sqlite3 as _sq
            conn = _sq.connect(str(db_path), check_same_thread=False)
            conn.row_factory = _sq.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.session_id, s.user_id, s.created_at, s.ended_at, s.title,
                       COUNT(m.message_id) as msg_count,
                       m_last.content as last_content,
                       m_last.timestamp as last_ts
                FROM sessions s
                LEFT JOIN messages m ON m.session_id = s.session_id
                LEFT JOIN messages m_last ON m_last.message_id = (
                    SELECT message_id FROM messages
                    WHERE session_id = s.session_id
                    ORDER BY timestamp DESC LIMIT 1
                )
                GROUP BY s.session_id
                HAVING msg_count > 0
                ORDER BY s.created_at DESC
                LIMIT 50
            """)
            for row in cursor.fetchall():
                sessions.append({
                    "session_id": row["session_id"],
                    "agent_name": agent_name,
                    "last_message": (row["last_content"] or "")[:80],
                    "last_time": row["last_ts"] or row["created_at"],
                    "message_count": row["msg_count"],
                    "unread": False,
                    "title": row["title"] or "",
                })
            conn.close()
        except Exception:
            pass

    # 添加内存中的活跃会话
    if agent and hasattr(agent, 'session_manager'):
        for sid, s in agent.session_manager.active_sessions.items():
            msg_count = len(s.messages) if hasattr(s, 'messages') else 0
            if msg_count == 0:
                continue
            if any(ses["session_id"] == sid for ses in sessions):
                continue
            last_msg = s.messages[-1] if hasattr(s, 'messages') and s.messages else None
            sessions.append({
                "session_id": sid,
                "agent_name": getattr(agent.config, 'agent_name', 'default'),
                "last_message": (last_msg.get("content", "")[:80] if last_msg else ""),
                "last_time": last_msg.get("timestamp", "") if last_msg else "",
                "message_count": msg_count,
                "unread": False,
                "title": getattr(s, 'title', ''),
            })

    sessions.sort(key=lambda s: s.get("last_time", ""), reverse=True)
    return sessions[:50]


def sync_agents(snapshot_mgr: "SnapshotManager") -> list:
    """加载智能体列表 → 返回 AgentInfo dict 列表（含 sessions）"""
    agents = []
    agents_dir = Path(os.path.dirname(__file__)).parent.parent / "agents"
    if not agents_dir.exists():
        return agents
    for d in agents_dir.iterdir():
        if not d.is_dir():
            continue
        config_path = d / "config.json"
        config = {}
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        # 从 DB 加载该 agent 的会话列表
        sessions = _load_agent_sessions(d.name, agents_dir)
        agents.append({
            "name": d.name,
            "icon": config.get("icon", "🎭"),
            "display_name": config.get("display_name", d.name),
            "model": config.get("model", ""),
            "sessions": sessions,
            "expanded": True,
        })
    return agents


def _load_agent_sessions(agent_name: str, agents_dir: Path) -> list:
    """从 DB 加载指定 agent 的会话摘要列表"""
    db_path = agents_dir / agent_name / "sessions" / "sessions.db"
    if not db_path.exists():
        return []
    try:
        import sqlite3 as _sq
        conn = _sq.connect(str(db_path), check_same_thread=False)
        conn.row_factory = _sq.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.session_id, s.user_id, s.created_at, s.ended_at, s.title,
                   COUNT(m.message_id) as msg_count,
                   m_last.content as last_content,
                   m_last.timestamp as last_ts
            FROM sessions s
            LEFT JOIN messages m ON m.session_id = s.session_id
            LEFT JOIN messages m_last ON m_last.message_id = (
                SELECT message_id FROM messages
                WHERE session_id = s.session_id
                ORDER BY timestamp DESC LIMIT 1
            )
            GROUP BY s.session_id
            HAVING msg_count > 0
            ORDER BY s.created_at DESC
            LIMIT 50
        """)
        sessions = []
        for row in cursor.fetchall():
            sessions.append({
                "session_id": row["session_id"],
                "user_id": row["user_id"],
                "created_at": row["created_at"],
                "ended_at": row["ended_at"],
                "title": row["title"] or "",
                "updated_at": row["last_ts"] or row["created_at"],
                "message_count": row["msg_count"],
                "last_message": (row["last_content"] or "")[:80],
            })
        conn.close()
        return sessions
    except Exception:
        return []
