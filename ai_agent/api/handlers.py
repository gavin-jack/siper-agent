"""
API 处理函数 — 从 siper_web.py 迁移

Phase 3 迁移内容：
  api_get_sessions / api_get_session_messages / api_delete_session
  api_save_response_dict / api_get_config / api_update_config
  api_get_skills / api_skill_preview / api_skill_stats
  api_get_agents / api_save_agent_meta / api_get_agent_soul
  api_get_agent_config / api_get_agent_memory / api_save_agent_file
  api_switch_agent / api_create_agent / api_delete_agent / api_rename_agent
  api_get_status / api_rename_session
  api_theme_list_templates / api_theme_save / api_theme_load
  api_theme_delete / api_theme_export / api_theme_import
  api_get_memory / api_write_memory / api_delete_memory
  api_get_memory_config / api_save_memory_config
  api_save_global_models / api_delete_model / api_reset_models
  api_get_global_models / api_rename_provider / api_update_provider_name
  api_discover_models / api_upgrade_check / api_upgrade_execute
  api_get_token_stats
"""
import asyncio
import datetime
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlparse

from ai_agent.api.router import ok, err

logger = logging.getLogger("siper_web.handlers")

# 全局变量（由 siper_web.py 注入）
agent = None
snapshot_mgr = None

# 以下全局变量在 siper_web.py 的 main() 中初始化，通过 set_globals() 注入
_models_db = None
_agent_session_managers = {}
_log_buffer = []
_token_usage_history = []
_token_db_conn = None
_upgrade_cache = {}
_upgrade_cache_lock = threading.Lock()
start_time = 0
port = 9724
PROJECT_ROOT = Path(".")  # 由 set_globals() 注入
_LOG_I18N_CACHE = None
ws_port = 9725
_SESSION_LIST_LIMIT = 50
_LOG_BUFFER_MAX = 2000
_TOKEN_USAGE_MAX = 500
_CONTEXT_WINDOW_DEFAULT = 8192
_WS_HEARTBEAT_TIMEOUT = 300
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def set_globals(**kwargs):
    """由 siper_web.py 调用，注入运行时全局变量。"""
    global _models_db, _agent_session_managers, _log_buffer, _token_usage_history
    global _token_db_conn, _upgrade_cache, _upgrade_cache_lock
    global start_time, port, ws_port
    global _SESSION_LIST_LIMIT, _LOG_BUFFER_MAX, _TOKEN_USAGE_MAX
    global _CONTEXT_WINDOW_DEFAULT, _WS_HEARTBEAT_TIMEOUT, PROJECT_ROOT
    for k, v in kwargs.items():
        if k == "agent":
            globals()["agent"] = v
        elif k == "models_db":
            _models_db = v
        elif k == "agent_session_managers":
            _agent_session_managers = v
        elif k == "log_buffer":
            _log_buffer = v
        elif k == "token_usage_history":
            _token_usage_history = v
        elif k == "token_db_conn":
            _token_db_conn = v
        elif k == "upgrade_cache":
            _upgrade_cache = v
        elif k == "upgrade_cache_lock":
            _upgrade_cache_lock = v
        elif k == "start_time":
            start_time = v
        elif k == "port":
            port = v
        elif k == "ws_port":
            ws_port = v
        elif k == "session_list_limit":
            _SESSION_LIST_LIMIT = v
        elif k == "log_buffer_max":
            _LOG_BUFFER_MAX = v
        elif k == "token_usage_max":
            _TOKEN_USAGE_MAX = v
        elif k == "context_window_default":
            _CONTEXT_WINDOW_DEFAULT = v
        elif k == "ws_heartbeat_timeout":
            _WS_HEARTBEAT_TIMEOUT = v
        elif k == "project_root":
            PROJECT_ROOT = v


# ===== 辅助函数 =====

def _memory_dir(agent_name="default"):
    d = Path.home() / ".siper" / "agents" / agent_name / "memory"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _memory_config_path(agent_name="default"):
    d = Path.home() / ".siper" / "agents" / agent_name / "memory"
    d.mkdir(parents=True, exist_ok=True)
    return d / "config.json"


def _themes_dir():
    d = Path.home() / ".siper" / "data" / "themes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _mask_key(key: str) -> str:
    """脱敏 API key：只保留后 4 位，其余用 * 替代。"""
    if not key or len(key) <= 4:
        return "****"
    return "*" * (len(key) - 4) + key[-4:]


def _format_session_messages(sid, messages):
    """Format messages for frontend (shared helper)."""
    result = []
    for m in messages:
        entry = {
            "role": m.get("role", m.get("message", {}).get("role", "unknown")),
            "content": m.get("content", m.get("message", {}).get("content", "")),
            "timestamp": m.get("timestamp", ""),
            "session_id": sid,
        }
        if isinstance(m.get("message"), dict):
            entry["role"] = m["message"].get("role", "unknown")
            entry["content"] = m["message"].get("content", "")
        raw_meta = m.get("meta", "{}")
        if isinstance(m.get("message"), dict):
            raw_meta = m["message"].get("meta", raw_meta)
        if raw_meta and raw_meta != "{}":
            try:
                entry["meta"] = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
            except Exception:
                pass
        result.append(entry)
    return {"success": True, "session_id": sid, "messages": result}


def _sync_models_to_agent_configs(models_data):
    """Sync models data to all agent config.json files.
    Accepts both flat format (from SQLite) and v2 provider format (legacy).
    """
    agents_dir = PROJECT_ROOT / "agents"
    if not agents_dir.exists():
        return
    # Build set of valid global model names (handle both formats)
    _global_names = set()
    if "providers" in models_data:
        for _pn, _pv in models_data.get("providers", {}).items():
            for _m in _pv.get("models", []):
                _global_names.add(_m.get("name", "") or _m.get("id", ""))
    for _m in models_data.get("models", []):
        _global_names.add(_m.get("name", "") or _m.get("id", ""))
    for agent_name_dir in agents_dir.iterdir():
        if not agent_name_dir.is_dir() or agent_name_dir.name.startswith("_") or agent_name_dir.name == "__pycache__":
            continue
        cfg_path = agent_name_dir / "config.json"
        cfg = {}
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        cfg["providers"] = models_data.get("providers", {})
        cfg["default_model"] = models_data.get("default_model", "")
        _old_avail = cfg.get("available_models", [])
        if _old_avail:
            _pruned = [n for n in _old_avail if n in _global_names]
            if len(_pruned) != len(_old_avail):
                logger.info(f"Agent {agent_name_dir.name}: 清理可用模型 {len(_old_avail)} → {len(_pruned)}")
            cfg["available_models"] = _pruned
        _def = cfg.get("default_chat_model", "")
        if _def and _def not in _global_names and _global_names:
            cfg["default_chat_model"] = ""
            logger.info(f"Agent {agent_name_dir.name}: 默认模型 '{_def}' 已删除，已重置")
        cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"已同步模型配置到 {cfg_path}")


# ===== Session API =====

def api_get_sessions():
    sessions = []
    agents_dir = Path(os.path.dirname(str(PROJECT_ROOT))) / "agents"
    # Collect from all agent session databases (sessions/sessions.db)
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
            conn = sqlite3.connect(str(db_path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
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
                LIMIT ?
            """, (_SESSION_LIST_LIMIT,))
            for row in cursor.fetchall():
                sessions.append({
                    "session_id": row["session_id"],
                    "user_id": row["user_id"],
                    "agent_name": agent_name,
                    "created_at": row["created_at"],
                    "updated_at": row["last_ts"] or row["created_at"],
                    "messages": row["msg_count"],
                    "active": row["ended_at"] is None,
                    "last_message": (row["last_content"][:80] if row["last_content"] else ""),
                    "title": row["title"] or "",
                })
            conn.close()
        except Exception as e:
            logger.error(f"api_get_sessions: failed to read {db_path}: {e}")
    # Also collect from current agent's in-memory active sessions
    unsaved = getattr(agent.session_manager, '_unsaved_sessions', set())
    for sid, s in agent.session_manager.active_sessions.items():
        if sid in unsaved:
            continue
        msg_count = len(s.messages)
        if msg_count == 0:
            continue
        # Skip if already in DB results
        if any(ses["session_id"] == sid for ses in sessions):
            continue
        last_msg = s.messages[-1] if s.messages else None
        sessions.append({
            "session_id": sid,
            "user_id": s.user_id,
            "agent_name": agent.config.agent_name or agent.config.name or "default",
            "created_at": s.created_at,
            "updated_at": last_msg["timestamp"] if last_msg else s.created_at,
            "messages": msg_count,
            "active": s.ended_at is None,
            "last_message": (last_msg["content"][:80] if last_msg and last_msg.get("content") else ""),
            "title": getattr(s, 'title', ''),
        })
    # Sort by updated_at descending
    sessions.sort(key=lambda s: s.get("updated_at", s["created_at"]), reverse=True)
    return {"sessions": sessions}


def api_get_session_messages(sid):
    """Get messages for a specific session (latest 50 only).
    Searches across all agent session databases."""
    try:
        # Try in-memory first across all session managers
        for sm in _agent_session_managers.values():
            unsaved = getattr(sm, '_unsaved_sessions', set())
            if sid not in unsaved and sid in sm.active_sessions:
                session = sm.active_sessions[sid]
                messages = session.messages[-50:]
                return _format_session_messages(sid, messages)

        # Load from DB across all agent directories
        agents_dir = PROJECT_ROOT / "agents"
        if agents_dir.exists():
            for agent_dir in agents_dir.iterdir():
                if not agent_dir.is_dir():
                    continue
                db_path = agent_dir / "sessions" / "sessions.db"
                if not db_path.exists():
                    continue
                conn = sqlite3.connect(str(db_path), check_same_thread=False)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                # Check if session exists in this db
                cursor.execute("SELECT 1 FROM sessions WHERE session_id = ?", (sid,))
                if cursor.fetchone():
                    cursor.execute(
                        "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 50",
                        (sid,)
                    )
                    messages = [dict(row) for row in cursor.fetchall()]
                    conn.close()
                    messages.reverse()
                    return _format_session_messages(sid, messages)
                conn.close()

        return {"success": False, "error": "Session not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_delete_session(sid):
    try:
        # Delete from all agent session databases
        agents_dir = Path(os.path.dirname(str(PROJECT_ROOT))) / "agents"
        agent_dirs = [agents_dir / "default"]
        if agents_dir.exists():
            for d in agents_dir.iterdir():
                if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                    agent_dirs.append(d)
        for agent_dir in agent_dirs:
            db_path = agent_dir / "sessions" / "sessions.db"
            if not db_path.exists():
                continue
            agent_name = agent_dir.name
            sm = _agent_session_managers.get(agent_name)
            if sm and sm._db_connection:
                try:
                    # Use the existing session manager's connection to avoid WAL conflicts
                    cursor = sm._db_connection.cursor()
                    cursor.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                    cursor.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                    sm._db_connection.commit()
                    logger.warning(f"api_delete_session: deleted session {sid} via {agent_name} session manager")
                    continue
                except Exception as e:
                    logger.error(f"api_delete_session: {agent_name} session manager delete failed: {e}")
            # Fallback: create a new connection
            try:
                conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
                conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
                conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                conn.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                conn.commit()
                conn.close()
                logger.warning(f"api_delete_session: deleted session {sid} via new connection to {db_path}")
            except Exception as e:
                logger.error(f"api_delete_session: failed to delete from {db_path}: {e}")
        # Also remove from all in-memory active sessions
        for _name, _sm in _agent_session_managers.items():
            if sid in _sm.active_sessions:
                del _sm.active_sessions[sid]
                logger.info(f"api_delete_session: removed session {sid} from {_name} active_sessions")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_rename_session(sid, body):
    try:
        title = (body or {}).get("title", "").strip()
        if not title:
            return {"success": False, "error": "标题不能为空"}
        # Find the session across all agent session managers
        sm = None
        for _name, _sm in _agent_session_managers.items():
            try:
                cursor = _sm._db_connection.cursor()
                cursor.execute("SELECT session_id FROM sessions WHERE session_id = ?", (sid,))
                if cursor.fetchone():
                    sm = _sm
                    break
            except Exception:
                continue
        if not sm:
            sm = agent.session_manager
        cursor = sm._db_connection.cursor()
        cursor.execute("UPDATE sessions SET title = ? WHERE session_id = ?", (title, sid))
        sm._db_connection.commit()
        return {"success": True, "title": title}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_save_response_dict(body):
    """Save the full response dict from dict modal to the message's meta column."""
    try:
        message_id = (body or {}).get("message_id", "").strip()
        response_dict = body.get("response_dict")
        if not message_id or not response_dict:
            return {"success": False, "error": "message_id and response_dict required"}
        # Find the message across all agent session DBs
        agents_dir = Path(os.path.dirname(str(PROJECT_ROOT))) / "agents"
        agent_dirs = [agents_dir / "default"]
        if agents_dir.exists():
            for d in agents_dir.iterdir():
                if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                    agent_dirs.append(d)
        for agent_dir in agent_dirs:
            db_path = agent_dir / "sessions" / "sessions.db"
            if not db_path.exists():
                continue
            conn = sqlite3.connect(str(db_path), check_same_thread=False)
            cur = conn.cursor()
            cur.execute("SELECT meta FROM messages WHERE message_id = ?", (message_id,))
            row = cur.fetchone()
            if row:
                # Merge response_dict into existing meta JSON
                try:
                    meta = json.loads(row[0]) if row[0] else {}
                except Exception:
                    meta = {}
                meta["response_dict"] = response_dict
                cur.execute("UPDATE messages SET meta = ? WHERE message_id = ?",
                            (json.dumps(meta, ensure_ascii=False, default=str), message_id))
                conn.commit()
                conn.close()
                return {"success": True}
            conn.close()
        return {"success": False, "error": "message not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== Config API =====

def api_get_config():
    metrics = agent.metrics.get_summary()
    llm_client = agent.llm_client
    # Get models from global models.db
    _all_models = _models_db.get_models_flat()["models"]
    _gm_default = ""
    _default_model = _models_db.get_default_model()
    if _default_model:
        _gm_default = _default_model.get("model", "")
    # Determine effective default model
    _effective_default = agent.config.default_chat_model or _gm_default or (llm_client.model if llm_client else "")
    return {
        "provider": "longcat",
        "base_url": llm_client.base_url if llm_client else "",
        "model": llm_client.model if llm_client else "",
        "api_key": "****" if llm_client and llm_client.api_key else "",
        "llm_configured": llm_client is not None,
        "agent_name": agent.config.name,
        "max_tools": agent.config.max_concurrent_tools,
        "max_tool_rounds": agent.config.max_tool_rounds,
        "session_timeout": agent.config.session_timeout,
        "port": port,
        "log_level": agent.config.log_level,
        "uptime": time.time() - start_time,
        "metrics": metrics,
        "icon": agent.config.icon or "🎭",
        "avatar": agent.config.avatar or "",
        # New model reference fields
        "models": _all_models,
        "default_model": _effective_default,
        "available_models": agent.config.available_models or [],
        "default_chat_model": agent.config.default_chat_model or "",
        "default_vision_model": agent.config.default_vision_model or "",
        "default_tts_model": agent.config.default_tts_model or "",
        # System parameters (from settings.json)
        "system": {
            "ws_heartbeat_timeout": _WS_HEARTBEAT_TIMEOUT,
            "session_list_limit": _SESSION_LIST_LIMIT,
            "log_buffer_size": _LOG_BUFFER_MAX,
            "token_usage_max": _TOKEN_USAGE_MAX,
            "context_window_default": _CONTEXT_WINDOW_DEFAULT,
            "port": port,
            "log_level": agent.config.log_level,
        },
    }


def api_update_config(body):
    try:
        # If model/base_url/api_key changed, rebuild LLMClient via configure_llm
        new_model = body.get("model", "")
        new_base_url = body.get("base_url", "")
        new_api_key = body.get("api_key", "")
        new_vision_base_url = body.get("vision_base_url", "")
        new_vision_model = body.get("vision_model", "")
        if new_model or new_base_url or new_api_key:
            # Merge with existing values for any not provided
            cur = agent.llm_client
            rebuild_model = new_model or (cur.model if cur else "")
            rebuild_base_url = new_base_url or (cur.base_url if cur else "")
            rebuild_api_key = new_api_key or (cur.api_key if cur else "")
            if rebuild_api_key:
                vision_key = os.environ.get("SENSENOVA_API_KEY", "")
                agent.configure_llm(
                    api_key=rebuild_api_key,
                    base_url=rebuild_base_url,
                    model=rebuild_model,
                    vision_api_key=vision_key,
                )
                logger.info(f"LLM 客户端已更新：模型={rebuild_model}, 地址={rebuild_base_url}")
            else:
                logger.warning("配置更新：未提供 API Key，跳过 LLM 客户端重建")
        if "agent_name" in body and body["agent_name"]:
            agent.config.name = body["agent_name"]
        if "max_tools" in body:
            agent.config.max_concurrent_tools = int(body["max_tools"])
        if "max_tool_rounds" in body:
            agent.config.max_tool_rounds = int(body["max_tool_rounds"])
        if "session_timeout" in body:
            agent.config.session_timeout = int(body["session_timeout"])
        # Per-agent response limits
        if "llm_timeout" in body:
            agent.config.llm_timeout = int(body["llm_timeout"])
        if "llm_max_tokens" in body:
            agent.config.llm_max_tokens = int(body["llm_max_tokens"])
        if "llm_max_retries" in body:
            agent.config.llm_max_retries = int(body["llm_max_retries"])
        if "max_history_messages" in body:
            agent.config.max_history_messages = int(body["max_history_messages"])
        if "log_level" in body:
            agent.config.log_level = body["log_level"]
        if "icon" in body:
            agent.config.icon = body["icon"]
        if "avatar" in body:
            agent.config.avatar = body["avatar"]
        # System parameters — save to settings.json
        if "system" in body:
            _sys = body["system"]
            _sf = PROJECT_ROOT / "settings.json"
            try:
                _cfg = json.loads(_sf.read_text(encoding="utf-8")) if _sf.exists() else {}
                _cfg.setdefault("system", {})
                for _k in ("ws_heartbeat_timeout", "session_list_limit", "log_buffer_size", "token_usage_max", "context_window_default"):
                    if _k in _sys:
                        _cfg["system"][_k] = int(_sys[_k])
                for _k in ("port", "log_level"):
                    if _k in _sys:
                        _cfg["system"][_k] = _sys[_k]
                _sf.write_text(json.dumps(_cfg, indent=2, ensure_ascii=False), encoding="utf-8")
                # 同步更新模块级变量，确保 api_get_config() 返回最新值
                global _WS_HEARTBEAT_TIMEOUT, _SESSION_LIST_LIMIT, _LOG_BUFFER_MAX, _TOKEN_USAGE_MAX, _CONTEXT_WINDOW_DEFAULT
                if "ws_heartbeat_timeout" in _sys:
                    _WS_HEARTBEAT_TIMEOUT = int(_sys["ws_heartbeat_timeout"])
                if "session_list_limit" in _sys:
                    _SESSION_LIST_LIMIT = int(_sys["session_list_limit"])
                if "log_buffer_size" in _sys:
                    _LOG_BUFFER_MAX = int(_sys["log_buffer_size"])
                if "token_usage_max" in _sys:
                    _TOKEN_USAGE_MAX = int(_sys["token_usage_max"])
                if "context_window_default" in _sys:
                    _CONTEXT_WINDOW_DEFAULT = int(_sys["context_window_default"])
                logger.info(f"系统参数已保存: {_cfg['system']}")
            except Exception as _e:
                logger.warning(f"保存系统参数失败: {_e}")
        # New model reference fields
        if "available_models" in body:
            agent.config.available_models = body["available_models"]
        if "default_chat_model" in body:
            agent.config.default_chat_model = body["default_chat_model"]
        if "default_vision_model" in body:
            agent.config.default_vision_model = body["default_vision_model"]
        if "default_tts_model" in body:
            agent.config.default_tts_model = body["default_tts_model"]
        if "models" in body:
            # Save models to models.db (NOT config.json)
            _models_db.save_models_flat({"models": body["models"]})
        if "default_model" in body:
            agent.config.default_chat_model = body["default_model"]
        # Persist non-model settings to config.json (models go to models.db)
        try:
            from agents import save_agent_config_file
            persist_data = {}
            for key in ("name", "icon", "avatar", "max_tool_rounds",
                        "available_models", "default_chat_model",
                        "default_vision_model", "default_tts_model"):
                if key in body:
                    persist_data[key] = body[key]
            # Also persist legacy fields for backward compat
            if "session_timeout" in body:
                persist_data["session_timeout"] = body["session_timeout"]
            if "max_tools" in body:
                persist_data["max_tools"] = body["max_tools"]
            if persist_data:
                save_agent_config_file(agent.config.agent_name, persist_data)
                logger.info(f"全局设置已保存到 config.json：{list(persist_data.keys())}")
        except Exception as e:
            logger.warning(f"保存 config.json 失败（仅内存生效）：{e}")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== Skills API =====

def api_get_skills():
    """Get all skills with registry info and usage stats"""
    # 防御性确保 skills/ 目录存在（git 不跟踪此目录，首次部署时可能缺失）
    _skills_dir = PROJECT_ROOT / "skills"
    if not _skills_dir.exists():
        _skills_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"自动创建 skills/ 目录: {_skills_dir}")
    skills = []
    # New format: from skill_registry
    if agent.skill_registry:
        for name, entry in agent.skill_registry.skills.items():
            detailed_stats = agent.skill_feedback.get_detailed_stats(name) if agent.skill_feedback else {}
            skills.append({
                "name": name,
                "description": entry.description,
                "version": entry.version,
                "capabilities": entry.capabilities,
                "source": entry.source,
                "enabled": entry.enabled,
                "active": name in agent.active_skills,
                "path": entry.path,
                "stats": {
                    "triggered": detailed_stats.get("total_triggers", 0),
                    "selected": detailed_stats.get("total_calls", 0),
                    "success": detailed_stats.get("total_success", 0),
                    "success_rate": (
                        detailed_stats.get("total_success", 0) / max(detailed_stats.get("total_calls", 1), 1)
                    ),
                    "effectiveness": detailed_stats.get("effectiveness", 0.5),
                    "avg_score": detailed_stats.get("avg_score", 0),
                    "avg_call_time": detailed_stats.get("avg_call_time", 0),
                },
            })
    else:
        # Fallback to old format
        for name, skill in agent.active_skills.items():
            skills.append({
                "name": name,
                "description": getattr(skill, "description", ""),
                "active": True,
            })
    return {"skills": skills}


def api_skill_preview(body=None):
    """Preview pre-filter results for a given input (debug API)"""
    data = body or {}
    user_input = data.get("input", "")
    top_k = data.get("top_k", 10)
    if not user_input or not agent.skill_pre_filter:
        return {"matched": [], "error": "No input or pre-filter disabled"}
    try:
        matched, scores = agent.skill_pre_filter.pre_filter(
            user_input, top_k=top_k,
            skill_feedback=getattr(agent, 'skill_feedback', None),
        )
        return {
            "matched": [
                {
                    "name": e.name,
                    "description": e.description,
                    "capabilities": e.capabilities,
                    "score": scores.get(e.name, 0),
                }
                for e in matched
            ],
            "total": len(matched),
        }
    except Exception as e:
        return {"matched": [], "error": str(e)}


def api_skill_stats():
    """Get skill usage statistics (detailed)"""
    if not agent.skill_feedback:
        return {"stats": {}}
    all_stats = agent.skill_feedback.get_all_detailed_stats()
    return {"stats": all_stats}


# ===== Agents API =====

def api_get_agents():
    try:
        from agents import list_agents, get_agent_dir, load_agent_config_file
        available = list_agents()
        # Load global models for enriching agent available_models
        _all_global_models = _models_db.get_models_flat()["models"]
        result = []
        for name in available:
            agent_dir = get_agent_dir(name)
            soul_exists = (agent_dir / "soul.md").exists() if agent_dir else False
            config_exists = (agent_dir / "agent.md").exists() if agent_dir else False
            memory_exists = (agent_dir / "memory.md").exists() if agent_dir else False
            # Load per-agent config (icon, avatar, models, display name) from config.json
            cfg = load_agent_config_file(name) or {}
            # Expand available_models from name list to full model objects
            _agent_avail = cfg.get("available_models", [])
            _agent_avail_models = []
            if _agent_avail:
                for mname in _agent_avail:
                    _gm = next((m for m in _all_global_models if m["name"] == mname), None)
                    if _gm:
                        _agent_avail_models.append(_gm)
                    # else: model no longer in global list — skip (was deleted)
            result.append({
                "name": name,
                "display_name": cfg.get("display_name") or cfg.get("name") or name,
                "icon": cfg.get("icon", "🎭"),
                "avatar": cfg.get("avatar", ""),
                "has_soul": soul_exists,
                "has_config": config_exists,
                "has_memory": memory_exists,
                "is_active": name == agent.config.agent_name,
                # Legacy fields (for backward compat)
                "models": cfg.get("models", []),
                "default_model": cfg.get("default_model", ""),
                # New model reference fields — available_models contains full objects
                "available_models": _agent_avail_models,
                "default_chat_model": cfg.get("default_chat_model", ""),
                "default_vision_model": cfg.get("default_vision_model", ""),
                "default_tts_model": cfg.get("default_tts_model", ""),
                "appearance": cfg.get("appearance", {}),
                "session_timeout": cfg.get("session_timeout", 3600),
                "max_tools": cfg.get("max_tools", 300),
                "max_tool_rounds": cfg.get("max_tool_rounds", 100),
                "llm_timeout": cfg.get("llm_timeout", 120),
                "llm_max_tokens": cfg.get("llm_max_tokens", 8192),
                "llm_max_retries": cfg.get("llm_max_retries", 2),
                "max_history_messages": cfg.get("max_history_messages", 50),
                "skill_pre_filter_top_k": cfg.get("skill_pre_filter_top_k", 5),
                "memory_integration": cfg.get("memory_integration", {}),
            })
        return {"agents": result, "active": agent.config.agent_name}
    except ImportError:
        return {"agents": [], "active": agent.config.agent_name, "error": "agents package not found"}


def api_save_agent_meta(name, body):
    """Save per-agent config.json (icon, avatar, name, model refs, display settings, session_timeout, max_tools)."""
    try:
        from agents import get_agent_dir, save_agent_config_file, load_agent_config_file
        agent_dir = get_agent_dir(name)
        if not agent_dir:
            return {"success": False, "error": "agent not found"}
        # Build the data to save (only known config keys)
        data = {}
        for key in ("name", "icon", "avatar", "models", "default_model",
                    "available_models", "default_chat_model", "default_vision_model", "default_tts_model",
                    "appearance", "session_timeout", "max_tools", "max_tool_rounds",
                    "llm_timeout", "llm_max_tokens", "llm_max_retries",
                    "max_history_messages", "skill_pre_filter_top_k", "memory_integration"):
            if key in body:
                # memory_integration: merge with existing to preserve mode/position/template
                if key == "memory_integration":
                    existing = load_agent_config_file(name) or {}
                    existing_mi = existing.get("memory_integration", {})
                    existing_mi.update(body[key])
                    data[key] = existing_mi
                else:
                    data[key] = body[key]
        ok = save_agent_config_file(name, data)
        if not ok:
            return {"success": False, "error": "save failed"}
        # If this is the active agent, apply config changes to runtime
        if name == agent.config.agent_name:
            if "name" in body:
                agent.config.name = body["name"]
            if "icon" in body:
                agent.config.icon = body["icon"]
            if "avatar" in body:
                agent.config.avatar = body["avatar"]
            # New model reference fields
            if "available_models" in body:
                agent.config.available_models = body["available_models"]
            if "default_chat_model" in body:
                agent.config.default_chat_model = body["default_chat_model"]
            if "default_vision_model" in body:
                agent.config.default_vision_model = body["default_vision_model"]
            if "default_tts_model" in body:
                agent.config.default_tts_model = body["default_tts_model"]
            # Per-agent response limits
            if "llm_timeout" in body:
                agent.config.llm_timeout = int(body["llm_timeout"])
            if "llm_max_tokens" in body:
                agent.config.llm_max_tokens = int(body["llm_max_tokens"])
            if "llm_max_retries" in body:
                agent.config.llm_max_retries = int(body["llm_max_retries"])
            if "max_history_messages" in body:
                agent.config.max_history_messages = int(body["max_history_messages"])
            # Legacy fields (backward compat)
            if "models" in body:
                pass  # models are saved to models.db (SQLite)
            if "default_model" in body:
                agent.config.default_chat_model = body["default_model"]
            # Rebuild LLMClient if model/base_url/api_key changed
            new_model = body.get("model", "")
            new_base_url = body.get("base_url", "")
            new_api_key = body.get("api_key", "")
            if new_model or new_base_url or new_api_key:
                cur = agent.llm_client
                rebuild_model = new_model or (cur.model if cur else "")
                rebuild_base_url = new_base_url or (cur.base_url if cur else "")
                rebuild_api_key = new_api_key or (cur.api_key if cur else "")
                if rebuild_api_key:
                    vision_key = os.environ.get("SENSENOVA_API_KEY", "")
                    # Get vision config from request body or existing agent config
                    vbu = body.get("vision_base_url", "")
                    vm = body.get("vision_model", "")
                    if not vbu and agent.config.default_vision_model:
                        vbu = getattr(agent.llm_client, 'base_url', "") if agent.llm_client else ""
                    agent.configure_llm(
                        api_key=rebuild_api_key,
                        base_url=rebuild_base_url,
                        model=rebuild_model,
                        vision_api_key=vision_key,
                        vision_base_url=vbu,
                        vision_model=vm,
                    )
                    logger.info(f"LLM 客户端已更新（agent meta）：模型={rebuild_model}, 地址={rebuild_base_url}")
                else:
                    logger.warning("Agent 配置更新：未提供 API Key，跳过 LLM 客户端重建")
            if "session_timeout" in body:
                agent.config.session_timeout = int(body["session_timeout"])
            if "max_tools" in body:
                agent.config.max_concurrent_tools = int(body["max_tools"])
            if "max_tool_rounds" in body:
                agent.config.max_tool_rounds = int(body["max_tool_rounds"])
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_get_agent_soul(name):
    try:
        from agents import load_agent_soul, get_agent_dir
        agent_dir = get_agent_dir(name)
        if not agent_dir:
            return {"error": "agent not found", "soul": ""}
        soul = load_agent_soul(name)
        return {"name": name, "soul": soul}
    except ImportError:
        return {"error": "agents package not found", "soul": ""}


def api_get_agent_config(name):
    try:
        from agents import get_agent_dir
        agent_dir = get_agent_dir(name)
        if not agent_dir:
            return {"error": "agent not found", "config": ""}
        # agent.md — 行为指令文件
        agent_md = agent_dir / "agent.md"
        if agent_md.exists():
            return {"name": name, "config": agent_md.read_text(encoding="utf-8")}
        return {"name": name, "config": ""}
    except ImportError:
        return {"error": "agents package not found", "config": ""}


def api_get_agent_memory(name):
    try:
        from agents import load_agent_memory, get_agent_dir
        agent_dir = get_agent_dir(name)
        if not agent_dir:
            return {"error": "agent not found", "memory": ""}
        mem = load_agent_memory(name)
        return {"name": name, "memory": mem}
    except ImportError:
        return {"error": "agents package not found", "memory": ""}


def api_save_agent_file(name, file_type, body):
    try:
        from agents import save_agent_file, get_agent_dir
        agent_dir = get_agent_dir(name)
        if not agent_dir:
            return {"success": False, "error": f"agent '{name}' not found"}
        content = body.get("content", "")
        # Reject empty content to prevent accidental data loss
        if not content or (isinstance(content, str) and content.strip() == ""):
            return {"success": False, "error": "content 不能为空"}
        ok = save_agent_file(name, file_type, content)
        if not ok:
            return {"success": False, "error": "save failed"}
        # Reload if this is the active agent
        if name == agent.config.agent_name:
            if file_type == "soul":
                agent._soul_content = content
            elif file_type == "config":
                agent._agent_config_content = content
            # memory.md is not loaded into agent runtime, no reload needed
        logger.info(f"已保存 Agent '{name}' 的 {file_type} 文件")
        return {"success": True}
    except Exception as e:
        logger.error(f"保存 Agent 文件错误：{e}")
        return {"success": False, "error": str(e)}


def api_switch_agent(body):
    global agent
    try:
        action = body.get("action", "")
        if action != "switch":
            return {"success": False, "error": "unknown action: " + action}
        target = body.get("agent", "")
        if not target:
            return {"success": False, "error": "missing agent name"}
        from agents import get_agent_dir, load_agent_soul, load_agent_config
        agent_dir = get_agent_dir(target)
        if not agent_dir:
            return {"success": False, "error": f"agent '{target}' not found or has no soul.md"}
        # Reload soul and config for new agent
        soul = load_agent_soul(target)
        cfg = load_agent_config(target)
        agent.config.agent_name = target
        agent._soul_content = soul or ""
        agent._agent_config_content = cfg or ""
        # Load per-agent config (icon, avatar, models, display name) from config.json
        from agents import load_agent_config_file
        agent_cfg = load_agent_config_file(target)
        if agent_cfg:
            if agent_cfg.get("name"):
                agent.config.name = agent_cfg["name"]
            if agent_cfg.get("icon"):
                agent.config.icon = agent_cfg["icon"]
            if agent_cfg.get("avatar"):
                agent.config.avatar = agent_cfg["avatar"]
            if agent_cfg.get("models"):
                # Legacy: migrate to available_models
                agent.config.available_models = [m.get("name", m.get("id", "")) for m in agent_cfg["models"]]
            if agent_cfg.get("default_model"):
                agent.config.default_chat_model = agent_cfg["default_model"]
                # Update LLM client if model config available
                for m in (agent_cfg.get("models") or []):
                    if m.get("name") == agent_cfg["default_model"]:
                        if agent.llm_client:
                            agent.llm_client.model = m.get("name", agent.llm_client.model)
                            agent.llm_client.base_url = m.get("base_url", agent.llm_client.base_url)
                            agent.llm_client.api_key = m.get("api_key", agent.llm_client.api_key)
                        break
            # New fields
            if agent_cfg.get("available_models"):
                agent.config.available_models = agent_cfg["available_models"]
            if agent_cfg.get("default_chat_model"):
                agent.config.default_chat_model = agent_cfg["default_chat_model"]
            if agent_cfg.get("default_vision_model"):
                agent.config.default_vision_model = agent_cfg["default_vision_model"]
            if agent_cfg.get("default_tts_model"):
                agent.config.default_tts_model = agent_cfg["default_tts_model"]
        logger.info(f"已切换 Agent 为：{target}")
        return {"success": True, "agent": target}
    except Exception as e:
        logger.error(f"切换 Agent 错误：{e}")
        return {"success": False, "error": str(e)}


def api_create_agent(body):
    """Create a new agent with default files (soul.md, agent.md, config.json, avatar)."""
    try:
        name = (body.get("name") or "").strip()
        if not name:
            return {"success": False, "error": "agent name is required"}
        # Name validation: alphanumeric + underscore + hyphen only
        if not re.match(r'^[a-zA-Z0-9_\-]+$', name):
            return {"success": False, "error": "name must be alphanumeric/underscore/hyphen"}
        from agents import list_agents, get_agent_dir, save_agent_config_file, ensure_agent_avatar
        if name in list_agents():
            return {"success": False, "error": f"agent '{name}' already exists"}
        agent_dir = get_agent_dir(name)
        agent_dir.mkdir(parents=True, exist_ok=True)
        # Create standard subdirectories (sessions, memory) for unified structure
        (agent_dir / "sessions").mkdir(exist_ok=True)
        (agent_dir / "memory").mkdir(exist_ok=True)
        # Initialize per-agent databases with unified schema
        from agents import init_agent_db
        init_agent_db(name)
        # Create default soul.md
        soul_path = agent_dir / "soul.md"
        if not soul_path.exists():
            soul_path.write_text(f"# {name}\n\nYou are {name}, an AI assistant.\n", encoding="utf-8")
        # Create default agent.md
        agent_md_path = agent_dir / "agent.md"
        if not agent_md_path.exists():
            agent_md_path.write_text(f"# {name} Configuration\n\n", encoding="utf-8")
        # Create config.json
        cfg = {
            "name": body.get("display_name") or name,
            "icon": body.get("icon") or "🎭",
            "default_chat_model": "",
            "available_models": [],
        }
        save_agent_config_file(name, cfg)
        # Ensure avatar
        try:
            ensure_agent_avatar(name)
        except Exception:
            pass
        logger.info(f"Created agent: {name}")
        return {"success": True, "agent": name}
    except Exception as e:
        logger.error(f"api_create_agent error: {e}")
        return {"success": False, "error": str(e)}


def api_delete_agent(name):
    """Delete an agent directory entirely. Refuses if it's the active agent."""
    try:
        from agents import list_agents, get_agent_dir
        if name not in list_agents():
            return {"success": False, "error": f"agent '{name}' not found"}
        if agent.config.agent_name == name:
            return {"success": False, "error": "cannot delete active agent, switch first"}
        agent_dir = get_agent_dir(name)
        if agent_dir.exists():
            shutil.rmtree(str(agent_dir))
        logger.info(f"Deleted agent: {name}")
        return {"success": True}
    except Exception as e:
        logger.error(f"api_delete_agent error: {e}")
        return {"success": False, "error": str(e)}


def api_rename_agent(name, body):
    """Rename an agent directory (folder rename only, no config writes)."""
    try:
        from agents import list_agents, get_agent_dir
        new_name = (body.get("new_name") or "").strip()
        if not new_name:
            return {"success": False, "error": "new_name is required"}
        if not re.match(r'^[a-zA-Z0-9_\-]+$', new_name):
            return {"success": False, "error": "new_name must be alphanumeric/underscore/hyphen"}
        if name not in list_agents():
            return {"success": False, "error": f"agent '{name}' not found"}
        if new_name in list_agents():
            return {"success": False, "error": f"agent '{new_name}' already exists"}
        old_dir = get_agent_dir(name)
        new_dir = get_agent_dir(new_name)
        if old_dir.exists():
            shutil.move(str(old_dir), str(new_dir))
        logger.info(f"Renamed agent: {name} -> {new_name}")
        return {"success": True, "old_name": name, "new_name": new_name}
    except Exception as e:
        logger.error(f"api_rename_agent error: {e}")
        return {"success": False, "error": str(e)}


def api_get_status():
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, agent.get_status())
            status = future.result(timeout=5)
    else:
        status = asyncio.run(agent.get_status())
    return {
        "agent": status,
        "uptime": time.time() - start_time,
        "port": port,
        "ws_port": ws_port,
    }


# ===== Theme API =====

def api_theme_list_templates():
    themes_dir = _themes_dir()
    templates = []
    for f in sorted(themes_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            vars_count = len(data.get("vars", {}))
            templates.append({
                "name": data.get("name", f.stem),
                "created_at": data.get("created_at", ""),
                "vars_count": vars_count,
            })
        except Exception:
            pass
    return {"templates": templates}


def api_theme_save(body):
    try:
        name = body.get("name", "").strip()
        if not name:
            return {"success": False, "error": "模板名称不能为空"}
        vars_obj = body.get("vars", {})
        sizes_obj = body.get("sizes", {})
        themes_dir = _themes_dir()
        safe_name = re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        record = {
            "name": name,
            "vars": vars_obj,
            "sizes": sizes_obj,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        fpath.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"主题已保存：{name} ({fpath})")
        return {"success": True, "name": name}
    except Exception as e:
        logger.error(f"主题保存错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_load(full_path):
    try:
        query = parse_qs(urlparse(full_path).query) if "?" in full_path else {}
        name = query.get("name", [""])[0].strip()
        if not name:
            return {"success": False, "error": "缺少 name 参数"}
        themes_dir = _themes_dir()
        safe_name = re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        if not fpath.exists():
            return {"success": False, "error": f"模板 '{name}' 不存在"}
        data = json.loads(fpath.read_text(encoding="utf-8"))
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"主题加载错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_delete(body):
    try:
        name = body.get("name", "").strip()
        if not name:
            return {"success": False, "error": "缺少 name 参数"}
        themes_dir = _themes_dir()
        safe_name = re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        if not fpath.exists():
            return {"success": False, "error": f"模板 '{name}' 不存在"}
        fpath.unlink()
        logger.info(f"主题已删除：{name}")
        return {"success": True}
    except Exception as e:
        logger.error(f"主题删除错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_export():
    """Export current runtime config as theme data (default CSS vars placeholder)."""
    # Return empty defaults - frontend fills in current live values
    return {"vars": {}, "sizes": {}}


def api_theme_import(body):
    """Import theme data by saving it as a new template (same as save)."""
    return api_theme_save(body)


# ===== Memory API =====

def api_get_memory(agent_name="default"):
    mem_dir = _memory_dir(agent_name)
    result = {}
    for f in sorted(mem_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            result[f.stem] = data
        except Exception:
            pass
    return {"memories": result, "count": len(result), "agent": agent_name}


def api_write_memory(body, agent_name="default"):
    key = body.get("key", "").strip()
    value = body.get("value", "")
    target = body.get("target", "memory")
    if not key:
        return {"success": False, "error": "missing 'key'"}
    mem_dir = _memory_dir(agent_name)
    fpath = mem_dir / f"{target}.json"
    data = {}
    if fpath.exists():
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    data[key] = value
    fpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"success": True, "key": key, "target": target, "agent": agent_name}


def api_delete_memory(body, agent_name="default"):
    key = body.get("key", "").strip()
    target = body.get("target", "memory")
    mem_dir = _memory_dir(agent_name)
    fpath = mem_dir / f"{target}.json"
    if not fpath.exists():
        return {"success": False, "error": f"memory file '{target}' not found"}
    try:
        data = json.loads(fpath.read_text(encoding="utf-8"))
    except Exception as e:
        return {"success": False, "error": str(e)}
    if key:
        if key in data:
            del data[key]
            fpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"success": True, "key": key, "action": "deleted"}
        return {"success": False, "error": f"key '{key}' not found"}
    else:
        fpath.unlink()
        return {"success": True, "target": target, "action": "cleared"}


# ===== Memory Config API =====

def api_get_memory_config(agent_name="default"):
    p = _memory_config_path(agent_name)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"mode": "append", "position": "after_system", "max_tokens": 2000, "template": ""}


def api_save_memory_config(body, agent_name="default"):
    p = _memory_config_path(agent_name)
    data = {}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    for key in ("mode", "position", "max_tokens", "template"):
        if key in body:
            data[key] = body[key]
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"success": True}


# ===== Global Models API =====

def api_save_global_models(body):
    # 写入 SQLite（内部保留 de-mask 逻辑）
    _models_db.save_models_flat(body)
    logger.info(f"模型配置已保存到 models.db")
    # Sync to all agent config.json files so api/config GET returns updated data
    try:
        _flat = _models_db.get_models_flat()
        _sync_models_to_agent_configs(_flat)
    except Exception as e:
        logger.warning(f"同步模型到 agent config 失败: {e}")
    return {"success": True, "version": 2}


def api_delete_model(path, req_headers):
    # DELETE /api/models/{model}?provider=xxx
    parsed = urlparse(path)
    model = unquote(parsed.path[len("/api/models/"):])
    params = parse_qs(parsed.query)
    provider_str = unquote(params.get("provider", [None])[0] or "")
    if not model:
        return {"success": False, "error": "model 不能为空"}
    try:
        # Find provider if not given
        if not provider_str:
            rows = _models_db.get_all_models()
            for row in rows:
                if row["model"] == model:
                    provider_str = str(row["provider_id"])
                    break
        if not provider_str:
            return {"success": False, "error": "模型不存在"}
        provider_id = int(provider_str)
        ok = _models_db.delete_model(model, provider_id)
        if ok:
            # Sync to agent configs
            try:
                _flat = _models_db.get_models_flat()
                _sync_models_to_agent_configs(_flat)
            except Exception:
                pass
            return {"success": True}
        return {"success": False, "error": "模型不存在"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_reset_models():
    """删除 models.db 并重建，清空内存缓存，同步清理 agent 配置"""
    db_path = str(PROJECT_ROOT / "models.db")
    # 1. 删除数据库文件
    if os.path.exists(db_path):
        os.remove(db_path)
        logger.info(f"已删除 {db_path}")
    # 2. 重建空数据库（ModelsDB.__init__ 自动建表）
    global _models_db
    from ai_agent.models_db import ModelsDB as _ModelsDB
    _models_db = _ModelsDB(db_path)
    # 3. 清空内存变量
    global _gm_models, _gm_default, _cfg_key_default
    _gm_models = []
    _gm_default = ""
    _cfg_key_default = ""
    # 4. 同步清理 agent config.json
    _sync_models_to_agent_configs({"version": 3, "models": []})
    logger.info("模型数据库已重置，agent 配置已清理")
    return {"success": True}


def api_get_global_models():
    # 从 SQLite 返回，保留 _mask_key 逻辑
    flat = _models_db.get_models_flat()
    for m in flat.get("models", []):
        m["api_key"] = _mask_key(m.get("api_key", ""))
    return flat


def api_rename_provider(body):
    old_id = (body.get("old_id") or "").strip()
    new_id = (body.get("new_id") or "").strip()
    if not old_id or not new_id:
        return {"success": False, "error": "old_id 和 new_id 不能为空"}
    if old_id == new_id:
        return {"success": True, "changed": False}
    try:
        ok = _models_db.rename_provider(old_id, new_id)
        if ok:
            return {"success": True, "changed": True}
        else:
            return {"success": False, "error": "Provider 不存在或新名称已存在"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_update_provider_name(body):
    base_url = (body.get("base_url") or "").strip()
    provider = (body.get("provider") or "").strip()
    provider_alias = (body.get("provider_alias") or "").strip()
    if not base_url:
        return {"success": False, "error": "base_url 不能为空"}
    try:
        ok = _models_db.update_provider_name(base_url, provider, provider_alias)
        if ok:
            return {"success": True}
        return {"success": False, "error": "Provider 不存在"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== Model Discovery API =====

def _detect_provider(base_url):
    """Detect provider name from base URL."""
    if not base_url:
        return "custom"
    url = base_url.lower()
    providers = [
        ("openai.com", "openai"),
        ("anthropic", "anthropic"),
        ("deepseek", "deepseek"),
        ("moonshot", "moonshot"), ("kimi", "moonshot"),
        ("dashscope", "qwen"), ("qwen", "qwen"),
        ("longcat", "longcat"),
        ("sensenova", "sensenova"),
        ("zhipuai", "zhipuai"), ("glm", "zhipuai"),
        ("minimax", "minimax"),
        ("baichuan", "baichuan"),
        ("groq", "groq"),
        ("together", "together"),
        ("fireworks", "fireworks"),
        ("perplexity", "perplexity"),
        ("openrouter", "openrouter"),
        ("localhost", "local"), ("127.0.0.1", "local"),
    ]
    for pattern, name in providers:
        if pattern in url:
            return name
    return "custom"


def _estimate_context_window(model):
    """Estimate context window (tokens) from model name."""
    if not model:
        return 8192
    mid = model.lower()
    # GPT-4o / GPT-4 Turbo
    if "gpt-4o" in mid:
        return 128000
    if "gpt-4-turbo" in mid or "gpt-4-1106" in mid or "gpt-4-0125" in mid:
        return 128000
    if "gpt-4" in mid:
        return 8192
    if "gpt-3.5" in mid:
        return 16384
    # Claude 3.x
    if "claude-3" in mid or "claude-3.5" in mid:
        return 200000
    # Gemini
    if "gemini-1.5" in mid or "gemini-2" in mid:
        return 1000000
    if "gemini" in mid:
        return 32768
    # DeepSeek
    if "deepseek" in mid:
        return 65536
    # Qwen
    if "qwen" in mid:
        return 32768
    # LongCat
    if "longcat" in mid:
        return 1000000
    # Mistral / Mixtral
    if "mixtral" in mid or "mistral" in mid:
        return 32768
    # Llama
    if "llama-3" in mid:
        return 8192
    if "llama-2" in mid:
        return 4096
    return 8192  # safe default


def api_discover_models(body):
    """Fetch available models from a provider.
    Body: { "base_url": "...", "api_key": "..." }
    Returns: { "success": true, "models": [...], "provider": "...", "count": N }
    """
    import ssl as _ssl
    import urllib.request as _urllib_request
    base_url = (body.get("base_url") or "").rstrip("/")
    api_key = body.get("api_key", "")
    if not base_url:
        return {"success": False, "error": "Base URL 不能为空"}
    # Build models endpoint URL
    if base_url.endswith("/v1"):
        models_url = base_url + "/models"
    else:
        models_url = base_url + "/v1/models"
    try:
        req = _urllib_request.Request(
            models_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="GET",
        )
        ctx = _ssl.create_default_context()
        # 仅对本地/内网地址禁用 SSL 验证
        if base_url.startswith(('http://', 'https://localhost', 'https://127.0.0.1', 'https://10.', 'https://192.168.', 'https://172.')):
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE
        resp = _urllib_request.urlopen(req, timeout=10, context=ctx)
        raw = json.loads(resp.read().decode("utf-8"))
        raw_models = raw.get("data") or raw.get("models") or (raw if isinstance(raw, list) else [])
        provider = _detect_provider(base_url)
        models_list = []
        for m in raw_models:
            mid = m.get("id", m.get("name", ""))
            if not mid:
                continue

            # --- Extract capabilities from API response ---
            caps = []

            # 1. OpenAI-style: model.detail.capabilities or model.capabilities
            m_caps = m.get("capabilities", {})
            if isinstance(m_caps, dict):
                cap_map = {
                    "vision": ["image", "vision", "multimodal", "image_input"],
                    "reasoning": ["reasoning", "chain_of_thought", "cot"],
                    "code": ["code", "coding", "code_interpreter"],
                    "function_calling": ["tool_call", "function_calling", "tools", "function_call"],
                    "embedding": ["embedding", "embeddings"],
                    "image_gen": ["image_generation", "image_gen", "dall_e", "dalle"],
                    "tts": ["tts", "text_to_speech", "audio", "speech"],
                }
                for cap_key, match_words in cap_map.items():
                    if any(m_caps.get(w) for w in match_words):
                        caps.append(cap_key)

            # 2. Ollama-style: model details fields
            m_details = m.get("details", {})
            if isinstance(m_details, dict):
                detail_caps = m_details.get("capabilities", [])
                if isinstance(detail_caps, list):
                    detail_cap_map = {
                        "vision": ["vision", "image", "multimodal", "clip"],
                        "reasoning": ["reasoning", "cot"],
                        "code": ["code", "coding"],
                        "function_calling": ["tools", "function_calling", "tool_call"],
                        "embedding": ["embedding"],
                        "image_gen": ["image_gen", "image_generation"],
                    }
                    for cap_key, match_words in detail_cap_map.items():
                        if any(dc in match_words for dc in detail_caps):
                            if cap_key not in caps:
                                caps.append(cap_key)

            # 3. OpenRouter-style: model object has modality or architecture
            m_arch = m.get("architecture", {})
            if isinstance(m_arch, dict):
                modality = m_arch.get("modality", "")
                if isinstance(modality, str):
                    mod_lower = modality.lower()
                    if "image" in mod_lower and "vision" not in caps:
                        caps.append("vision")
                    if "embedding" in mod_lower and "embedding" not in caps:
                        caps.append("embedding")

            # 4. SenseNova-style: model_type / task_type / tasks fields
            model_type = m.get("model_type") or m.get("task_type") or m.get("type", "")
            if isinstance(model_type, str):
                mt_lower = model_type.lower()
                type_map = {
                    "vision": ["vision", "image", "multimodal", "vl"],
                    "tts": ["tts", "text_to_speech"],
                    "embedding": ["embedding", "embed"],
                    "image_gen": ["image_gen", "image_generation", "text2image", "t2i"],
                    "code": ["code", "coding"],
                    "reasoning": ["reasoning", "cot"],
                }
                for cap_key, keywords in type_map.items():
                    if any(kw in mt_lower for kw in keywords) and cap_key not in caps:
                        caps.append(cap_key)
            tasks = m.get("tasks") or m.get("capabilities_list") or m.get("support_tasks", [])
            if isinstance(tasks, list):
                task_map = {
                    "vision": ["vision", "image", "multimodal", "vl", "image_understanding"],
                    "tts": ["tts", "text_to_speech"],
                    "embedding": ["embedding", "embed", "text_embedding"],
                    "image_gen": ["image_gen", "image_generation", "text2image", "t2i", "image_create"],
                    "code": ["code", "coding", "code_generation"],
                    "reasoning": ["reasoning", "cot", "chain_of_thought"],
                    "function_calling": ["function_calling", "tool_call", "tools", "function_call"],
                    "chat": ["chat", "text", "conversation"],
                }
                for cap_key, keywords in task_map.items():
                    if any(t.lower() in keywords for t in tasks if isinstance(t, str)) and cap_key not in caps:
                        caps.append(cap_key)

            # 5. Context length from API response (prefer over name-based estimate)
            ctx_window = m.get("context_length") or m.get("max_context_length") or m.get("context_window")
            if not ctx_window:
                ctx_window = _estimate_context_window(mid)

            # If API gave no capabilities, default to chat
            if not caps:
                caps.append("chat")

            models_list.append({
                "id": mid,
                "name": mid,
                "alias": "",
                "provider": provider,
                "provider_alias": "",
                "base_url": base_url,
                "api_key": api_key,
                "context_window": ctx_window,
                "capabilities": caps,
                "discovered_at": int(time.time()),
            })
        return {
            "success": True,
            "models": models_list,
            "provider": provider,
            "count": len(models_list),
            "url": models_url,
        }
    except Exception as e:
        logger.warning(f"模型发现失败: {models_url} — {e}")
        return {"success": False, "error": str(e), "url": models_url}


# ===== Upgrade API =====

def api_upgrade_check():
    """Return cached upgrade info immediately (non-blocking).
    Cache is populated by the background thread started in main()."""
    with _upgrade_cache_lock:
        cached = dict(_upgrade_cache)
    if cached.get("checked_at", 0) > 0 and (time.time() - cached["checked_at"]) < 1800:
        return cached
    return cached


def api_upgrade_execute():
    """Execute upgrade: git pull + restart."""
    try:
        project_root = Path(os.path.dirname(os.path.abspath(str(PROJECT_ROOT))))

        # Step 1: git pull
        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=str(project_root), capture_output=True, text=True, timeout=60
        )
        pull_output = result.stdout.strip()
        pull_error = result.stderr.strip()

        if result.returncode != 0:
            return {
                "success": False,
                "stage": "git_pull",
                "error": pull_error or pull_output,
            }

        # Step 2: Schedule restart after response is sent
        loop = asyncio.get_event_loop()
        loop.call_later(2, lambda: os.execv(sys.executable, [sys.executable] + sys.argv))

        return {
            "success": True,
            "message": "升级成功，服务正在重启...",
            "pull_output": pull_output,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== Token Stats API =====

def api_get_token_stats():
    now = time.time()
    ctx_window = 1_000_000
    total_prompt = 0
    total_completion = 0
    total = 0
    total_requests = 0
    model_map = {}
    date_map = {}
    hourly_raw = {}
    heatmap = {}

    try:
        if _token_db_conn:
            cur = _token_db_conn.cursor()

            # Summary totals
            cur.execute("""
                SELECT COUNT(*), COALESCE(SUM(prompt_tokens), 0),
                       COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_tokens), 0)
                FROM token_usage WHERE total_tokens > 0
            """)
            row = cur.fetchone()
            total_requests = row[0]
            total_prompt = row[1]
            total_completion = row[2]
            total = row[3]

            # Per-model breakdown
            cur.execute("""
                SELECT m.name, COUNT(*),
                       SUM(t.prompt_tokens), SUM(t.completion_tokens), SUM(t.total_tokens)
                FROM token_usage t
                LEFT JOIN token_models m ON t.model_id = m.id
                WHERE t.total_tokens > 0
                GROUP BY m.name ORDER BY SUM(t.total_tokens) DESC
            """)
            for r in cur.fetchall():
                model_map[r[0] or "unknown"] = {
                    "model": r[0] or "unknown",
                    "requests": r[1],
                    "prompt_tokens": r[2],
                    "completion_tokens": r[3],
                    "total_tokens": r[4],
                }

            # Per-date stats (last 30 days)
            cur.execute("""
                SELECT DATE(ts, 'unixepoch', 'localtime') as d,
                       SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                FROM token_usage
                WHERE ts > ? AND total_tokens > 0
                GROUP BY d ORDER BY d ASC
            """, (int(now - 30 * 86400),))
            for row in cur.fetchall():
                date_map[row[0]] = {
                    "prompt_tokens": row[1], "completion_tokens": row[2],
                    "total_tokens": row[3], "requests": row[4]
                }

            # Per-hour stats (last 24 consecutive hours)
            cur.execute("""
                SELECT (ts / 3600) as hour_bucket,
                       SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                FROM token_usage
                WHERE ts > ? AND total_tokens > 0
                GROUP BY hour_bucket ORDER BY hour_bucket ASC
            """, (int(now - 86400),))
            for row in cur.fetchall():
                hourly_raw[row[0]] = {
                    "prompt_tokens": row[1], "completion_tokens": row[2],
                    "total_tokens": row[3], "requests": row[4]
                }

            # Day-of-week × hour heatmap (last 30 days)
            cur.execute("""
                SELECT CAST(strftime('%w', ts, 'unixepoch', 'localtime') AS INTEGER) as dow,
                       CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) as hour,
                       SUM(total_tokens) as total, COUNT(*) as requests
                FROM token_usage
                WHERE ts > ? AND total_tokens > 0
                GROUP BY dow, hour
            """, (int(now - 30 * 86400),))
            for row in cur.fetchall():
                key = f"{row[0]}_{row[1]}"
                heatmap[key] = {"dow": row[0], "hour": row[1], "total_tokens": row[2], "requests": row[3]}

    except Exception as e:
        logger.warning(f"Token stats query failed: {e}")

    # Build model_stats list
    model_stats = sorted(model_map.values(), key=lambda x: -x["total_tokens"])

    # Build 24-slot hourly list
    now_local = datetime.datetime.now()
    cur_hour_bucket = int(now_local.timestamp()) // 3600
    start_bucket = cur_hour_bucket - 23
    hourly = []
    for b in range(start_bucket, cur_hour_bucket + 1):
        next_local = datetime.datetime.fromtimestamp((b + 1) * 3600)
        h_label = next_local.strftime('%H')
        if b in hourly_raw:
            hourly.append({"hour": h_label, "bucket": b, **hourly_raw[b]})
        else:
            hourly.append({"hour": h_label, "bucket": b, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "requests": 0})

    # Build 7×24 heatmap grid
    heatmap_grid = []
    for dow in range(7):
        for hour in range(24):
            key = f"{dow}_{hour}"
            cell = heatmap.get(key, {"dow": dow, "hour": hour, "total_tokens": 0, "requests": 0})
            heatmap_grid.append(cell)

    return {
        "history": [],  # Removed: history table no longer displayed
        "total_requests": total_requests,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_tokens": total,
        "context_window": ctx_window,
        "model": agent.llm_client.model if agent.llm_client else "",
        "model_stats": model_stats,
        "date_stats": date_map,
        "hourly_stats": hourly,
        "heatmap": heatmap_grid,
    }


# ===== 文件上传 =====
# 常量（从 siper_web.py 迁移）
FILE_CATEGORIES = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"},
    "document": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv", ".json", ".xml", ".toml", ".ini", ".cfg", ".conf"},
    "code": {".py", ".js", ".ts", ".html", ".css", ".java", ".c", ".h", ".go", ".php", ".sh", ".bash", ".zsh", ".bat", ".ps1", ".sql"},
    "archive": {".zip", ".rar", ".7z", ".tar"},
    "audio": {".mp3", ".wav", ".aac", ".wma", ".m4a"},
    "video": {".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".mpg", ".mpeg", ".3gp"},
}

IMAGE_MAGIC = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": None,
    ".bmp": b"BM",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _get_file_category(ext):
    ext_lower = ext.lower()
    for cat, exts in FILE_CATEGORIES.items():
        if ext_lower in exts:
            return cat
    return "other"


def _extract_multipart_file(raw_request: bytes):
    """Extract first file field from multipart/form-data request body."""
    import cgi
    import io as _io
    header_end = raw_request.find(b"\r\n\r\n")
    if header_end < 0:
        return None, None
    header_section = raw_request[:header_end].decode("utf-8", errors="replace")
    body_section = raw_request[header_end + 4:]
    boundary = None
    content_type = ""
    for line in header_section.split("\r\n"):
        low = line.lower()
        if low.startswith("content-type:"):
            content_type = line.split(":", 1)[1].strip()
            for part in content_type.split(";"):
                part = part.strip()
                if part.lower().startswith("boundary="):
                    boundary = part.split("=", 1)[1].strip().strip('"')
                    break
    if not boundary:
        return None, None
    environ = {
        'REQUEST_METHOD': 'POST',
        'CONTENT_TYPE': content_type or f'multipart/form-data; boundary={boundary}',
        'CONTENT_LENGTH': str(len(body_section)),
    }
    try:
        fs = cgi.FieldStorage(fp=_io.BytesIO(body_section), environ=environ, keep_blank_values=True)
        for key in fs.keys():
            item = fs[key]
            if hasattr(item, 'filename') and item.filename:
                return item.filename, item.file.read()
    except Exception:
        pass
    return None, None


def _extract_multipart_field(raw_request: bytes, field_name: str):
    """Extract a text field value from multipart/form-data request body."""
    import cgi
    import io as _io
    header_end = raw_request.find(b"\r\n\r\n")
    if header_end < 0:
        return None
    header_section = raw_request[:header_end].decode("utf-8", errors="replace")
    body_section = raw_request[header_end + 4:]
    boundary = None
    content_type = ""
    for line in header_section.split("\r\n"):
        low = line.lower()
        if low.startswith("content-type:"):
            content_type = line.split(":", 1)[1].strip()
            for part in content_type.split(";"):
                part = part.strip()
                if part.lower().startswith("boundary="):
                    boundary = part.split("=", 1)[1].strip().strip('"')
                    break
    if not boundary:
        return None
    environ = {
        'REQUEST_METHOD': 'POST',
        'CONTENT_TYPE': content_type or f'multipart/form-data; boundary={boundary}',
        'CONTENT_LENGTH': str(len(body_section)),
    }
    try:
        fs = cgi.FieldStorage(fp=_io.BytesIO(body_section), environ=environ, keep_blank_values=True)
        if field_name in fs:
            item = fs[field_name]
            if not item.filename:
                return item.value
    except Exception:
        pass
    return None


def api_upload_file(body, raw_request=None):
    """Handle file upload from the frontend."""
    import base64 as _base64
    import re as _re
    from pathlib import Path as _Path

    file_data = body.get("data", "")
    file_name = body.get("name", "uploaded_file")
    mime = body.get("mime", "")

    if not file_data:
        return {"success": False, "error": "未提供文件数据"}

    try:
        if file_data.startswith("data:"):
            header, b64_data = file_data.split(",", 1)
        else:
            b64_data = file_data
        raw_bytes = _base64.b64decode(b64_data)

        if len(raw_bytes) > MAX_FILE_SIZE:
            return {"success": False, "error": f"文件过大（{len(raw_bytes) // 1024}KB），最大允许 {MAX_FILE_SIZE // 1024}KB"}

        dot_pos = file_name.rfind(".")
        if dot_pos > 0:
            ext = file_name[dot_pos:].lower()
            name_part = file_name[:dot_pos]
        else:
            ext = ""
            name_part = file_name

        category = _get_file_category(ext)

        if category == "image" and ext in IMAGE_MAGIC:
            magic = IMAGE_MAGIC[ext]
            if ext == ".webp":
                if not (raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP"):
                    return {"success": False, "error": "图片格式与声明类型不一致"}
            elif ext == ".gif":
                if not raw_bytes[:6] in (b"GIF87a", b"GIF89a"):
                    return {"success": False, "error": "图片格式与声明类型不一致"}
            elif magic and not raw_bytes.startswith(magic):
                return {"success": False, "error": "文件格式与声明类型不一致，可能包含恶意内容"}

        upload_dir = PROJECT_ROOT / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        safe_name = _re.sub(r'[^\w\-.]', '_', name_part) or f"file_{int(time.time())}"
        file_path = upload_dir / f"{safe_name}{ext}" if ext else upload_dir / safe_name
        counter = 1
        while file_path.exists():
            file_path = upload_dir / f"{safe_name}_{counter}{ext}" if ext else upload_dir / f"{safe_name}_{counter}"
            counter += 1

        file_path.write_bytes(raw_bytes)
        logger.info(f"文件已上传：{file_path} ({len(raw_bytes)} 字节, 分类: {category})")

        return {
            "success": True,
            "path": str(file_path),
            "name": file_path.name,
            "size": len(raw_bytes),
            "mime": mime,
            "category": category,
        }
    except Exception as e:
        logger.error(f"文件上传失败：{e}")
        return {"success": False, "error": str(e)}


# ===== 日志查询 =====
def _get_log_i18n():
    """Get the LOG_I18N dict (loaded from JSON file, cached)."""
    global _LOG_I18N_CACHE
    if _LOG_I18N_CACHE is None:
        i18n_path = PROJECT_ROOT / "webui" / "static" / "i18n" / "log-i18n.json"
        try:
            with open(i18n_path, "r", encoding="utf-8") as f:
                _LOG_I18N_CACHE = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load log i18n file: {e}")
            _LOG_I18N_CACHE = {}
    return _LOG_I18N_CACHE


def _translate_log_entry(entry, lang="zh"):
    """Translate a log entry's message based on lang."""
    if lang == "zh":
        return entry
    msg = entry.get("message", "")
    log_i18n = _get_log_i18n()
    if msg in log_i18n:
        entry = dict(entry)
        entry["message"] = log_i18n[msg].get(lang, msg)
        return entry
    for template, translations in log_i18n.items():
        prefix = template.split("{")[0] if "{" in template else template
        if prefix and msg.startswith(prefix):
            entry = dict(entry)
            entry["message"] = translations.get(lang, msg)
            return entry
    return entry


def api_get_logs(full_path, log_buffer=None):
    """Get logs with filtering and pagination."""
    from urllib.parse import parse_qs, urlparse

    query = parse_qs(urlparse(full_path).query) if "?" in full_path else {}
    levels = query.get("levels", [""])[0].split(",") if query.get("levels") else []
    levels = [l.strip().upper() for l in levels if l.strip()]
    source = query.get("source", [""])[0].strip()
    search = query.get("search", [""])[0].strip().lower()
    lang = query.get("lang", ["zh"])[0].strip()
    try:
        limit = min(int(query.get("limit", ["100"])[0]), 500)
    except ValueError:
        limit = 100
    try:
        offset = max(int(query.get("offset", ["0"])[0]), 0)
    except ValueError:
        offset = 0

    filtered = log_buffer if log_buffer is not None else []
    if levels:
        filtered = [e for e in filtered if e["level"].upper() in levels]
    if source:
        filtered = [e for e in filtered if source.lower() in e["logger"].lower()]
    if search:
        filtered = [e for e in filtered if search in e["message"].lower()]

    total = len(filtered)
    entries = list(reversed(filtered))[offset:offset + limit]
    if lang != "zh":
        entries = [_translate_log_entry(e, lang) for e in entries]
    all_sources = sorted(set(e["logger"] for e in log_buffer)) if log_buffer else []
    all_levels = sorted(set(e["level"].upper() for e in log_buffer)) if log_buffer else []
    return {
        "logs": entries,
        "total": total,
        "offset": offset,
        "limit": limit,
        "sources": all_sources,
        "levels": all_levels,
    }


    async def api_test_model(body):
        """Send a test message to verify a model is working and detect capabilities.
        Body: { "base_url": "...", "model": "...", "api_key": "..." }
        Returns: { "success": true/false, "response": "...", "latency_ms": N, "error": "...",
                   "capabilities": ["vision", "function_calling", ...] }
        """
        import urllib.request as _urllib_request
        import ssl as _ssl
        base_url = (body.get("base_url") or "").rstrip("/")
        api_key = body.get("api_key", "")
        model = body.get("model", "")
        provider_id = body.get("provider_id", 0)
        if not base_url or not model:
            return {"success": False, "error": "base_url 和 model 不能为空"}
        # If api_key is masked (from frontend /api/models/global), look up real key from models.db
        if api_key.startswith("*") or not api_key:
            try:
                _db_model = _models_db.get_model(model, int(provider_id) if provider_id else 0)
                if _db_model:
                    _new_key = _db_model.get("prov_api_key", "") or ""
                    if _new_key and not _new_key.startswith("*"):
                        api_key = _new_key
                    if not base_url:
                        base_url = _db_model.get("prov_base_url", "") or ""
            except Exception:
                pass
        if not api_key or api_key.startswith("*"):
            return {"success": False, "error": "无法获取模型 API key，请在 Web UI 配置页面设置"}
        if base_url.endswith("/v1"):
            chat_url = base_url + "/chat/completions"
        else:
            chat_url = base_url + "/v1/chat/completions"



    async def api_test_model(body):
        """Send a test message to verify a model is working and detect capabilities.
        Body: { "base_url": "...", "model": "...", "api_key": "..." }
        Returns: { "success": true/false, "response": "...", "latency_ms": N, "error": "...",
                   "capabilities": ["vision", "function_calling", ...] }
        """
        import urllib.request as _urllib_request
        import ssl as _ssl
        base_url = (body.get("base_url") or "").rstrip("/")
        api_key = body.get("api_key", "")
        model = body.get("model", "")
        provider_id = body.get("provider_id", 0)
        if not base_url or not model:
            return {"success": False, "error": "base_url 和 model 不能为空"}
        # If api_key is masked (from frontend /api/models/global), look up real key from models.db
        if api_key.startswith("*") or not api_key:
            try:
                _db_model = _models_db.get_model(model, int(provider_id) if provider_id else 0)
                if _db_model:
                    _new_key = _db_model.get("prov_api_key", "") or ""
                    if _new_key and not _new_key.startswith("*"):
                        api_key = _new_key
                    if not base_url:
                        base_url = _db_model.get("prov_base_url", "") or ""
            except Exception:
                pass
        if not api_key or api_key.startswith("*"):
            return {"success": False, "error": "无法获取模型 API key，请在 Web UI 配置页面设置"}
        if base_url.endswith("/v1"):
            chat_url = base_url + "/chat/completions"
        else:
            chat_url = base_url + "/v1/chat/completions"

        def _do_test():
            ctx = _ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE

            def _post(payload_dict, timeout=15):
                payload = json.dumps(payload_dict).encode("utf-8")
                req = _urllib_request.Request(
                    chat_url,
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                resp = _urllib_request.urlopen(req, timeout=timeout, context=ctx)
                return json.loads(resp.read().decode("utf-8"))

            def _post_stream(payload_dict, timeout=15):
                """Streaming POST, returns (ttft_ms, full_text, usage_dict, total_ms)."""
                payload = json.dumps({**payload_dict, "stream": True}).encode("utf-8")
                req = _urllib_request.Request(
                    chat_url,
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                t0 = time.time()
                resp = _urllib_request.urlopen(req, timeout=timeout, context=ctx)
                first_content_t = None
                full_text = ""
                usage = {}
                buf = b""
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line_s = line.decode("utf-8", errors="replace").strip()
                        if not line_s or not line_s.startswith("data:"):
                            continue
                        data_s = line_s[5:].strip()
                        if data_s == "[DONE]" or data_s.endswith("[DONE]"):
                            break
                        try:
                            obj = json.loads(data_s)
                            delta = (obj.get("choices") or [{}])[0].get("delta") or {}
                            content = delta.get("content")
                            if content:
                                if first_content_t is None:
                                    first_content_t = time.time()
                                full_text += content
                            if obj.get("lastOne") and obj.get("usage"):
                                usage = obj["usage"]
                            elif obj.get("usage"):
                                usage = obj["usage"]
                        except (json.JSONDecodeError, IndexError):
                            pass
                ttft = round((first_content_t - t0) * 1000) if first_content_t else None
                total_ms = round((time.time() - t0) * 1000)
                return ttft, full_text, usage, total_ms

            def _extract_message_content(msg_dict):
                content = (msg_dict.get("content") or "").strip()
                reasoning = (msg_dict.get("reasoning") or "").strip()
                if content and reasoning:
                    return content + "\n" + reasoning
                return content or reasoning

            detected_caps = []

            # ===== Step 0: try to get model info from /models endpoint =====
            try:
                models_url = base_url + "/models" if not base_url.endswith("/v1") else base_url.replace("/v1", "") + "/models"
                req = _urllib_request.Request(
                    models_url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    method="GET",
                )
                resp = _urllib_request.urlopen(req, timeout=3, context=ctx)
                models_data = json.loads(resp.read().decode("utf-8"))
                for m in (models_data.get("data") or []):
                    mid = m.get("id", "")
                    if mid == model:
                        m_caps = m.get("capabilities", {})
                        if isinstance(m_caps, dict):
                            if any(m_caps.get(k) for k in ("image", "vision", "multimodal", "image_input")):
                                detected_caps.append("vision")
                            if any(m_caps.get(k) for k in ("reasoning", "chain_of_thought", "cot")):
                                detected_caps.append("reasoning")
                            if any(m_caps.get(k) for k in ("code", "coding", "code_interpreter")):
                                detected_caps.append("code")
                            if any(m_caps.get(k) for k in ("tool_call", "function_calling", "tools")):
                                detected_caps.append("function_calling")
                        arch = m.get("architecture", {})
                        if isinstance(arch, dict):
                            modality = (arch.get("modality") or "").lower()
                            if "image" in modality and "vision" not in detected_caps:
                                detected_caps.append("vision")
                        break
            except Exception:
                pass

            # ===== Step 1: connectivity + TTFT + streaming test =====
            t0 = time.time()
            ttft_ms = None
            streaming_ok = False
            content = ""
            try:
                ttft_ms, content_s, _usage_s, _total = _post_stream({
                    "model": model,
                    "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                    "max_tokens": 5,
                    "temperature": 0,
                })
                streaming_ok = bool(content_s)
                content = content_s
            except Exception:
                pass
            latency_ms = round((time.time() - t0) * 1000)
            if not content:
                try:
                    raw = _post({
                        "model": model,
                        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                        "max_tokens": 5,
                        "temperature": 0,
                    })
                    choices = raw.get("choices", [])
                    if choices:
                        content = _extract_message_content(choices[0].get("message", {}))
                except Exception:
                    pass

            # ===== Step 2: probe reasoning =====
            try:
                raw_r = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Solve step by step: If a bat and ball cost $1.10 together, and the bat costs $1.00 more than the ball, how much does the ball cost? Show your reasoning."}],
                    "max_tokens": 256,
                    "temperature": 0,
                })
                choices_r = raw_r.get("choices", [])
                if choices_r:
                    msg_r = choices_r[0].get("message", {})
                    reply = _extract_message_content(msg_r)
                    reply_lower = reply.lower()
                    has_reasoning_field = bool(msg_r.get("reasoning_content")) or bool(msg_r.get("reasoning"))
                    has_think_tag = "<think>" in reply or "</think>" in reply
                    reasoning_words = ("step", "therefore", "because", "reasoning",
                                       "first", "second", "third", "let's think",
                                       "let me think", "so the", "thus", "hence",
                                       "thinking process", "analysis")
                    has_step_words = sum(1 for w in reasoning_words if w in reply_lower) >= 3
                    has_correct_answer = "0.05" in reply or "5 cents" in reply_lower or "5 cent" in reply_lower
                    if has_reasoning_field or has_think_tag:
                        detected_caps.append("reasoning")
                    elif has_step_words and has_correct_answer and len(reply) > 80:
                        detected_caps.append("reasoning")
            except Exception as e:
                logger.debug(f"Model {model} reasoning probe error: {e}")

            # ===== Step 3: probe code =====
            try:
                raw_c = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Write a Python function to check if a number is prime. Only output the code, no explanation."}],
                    "max_tokens": 256,
                    "temperature": 0,
                })
                choices_c = raw_c.get("choices", [])
                if choices_c:
                    reply_c = _extract_message_content(choices_c[0].get("message", {}))
                    has_code_block = "```python" in reply_c or "```py" in reply_c or "```\ndef " in reply_c
                    has_function_def = "def " in reply_c and "return " in reply_c and ("(" in reply_c and "):" in reply_c)
                    has_code_keywords = sum(1 for kw in ("def ", "return ", "for ", "if ", "else:", "import ", "class ", "print(")
                                            if kw in reply_c) >= 3
                    if has_code_block or (has_function_def and has_code_keywords):
                        detected_caps.append("code")
            except Exception as e:
                logger.debug(f"Model {model} code probe error: {e}")

            # ===== Step 4: probe vision =====
            try:
                red_png_b64 = (
                    "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAMklEQVQ4T2N88ODhfwY0wMjIyIBOY2BgYGBkZGRgZGRkYKCgYGBgYGBgYGBgYGBgAAB"
                    "ZSwX/2QnKwAAAAABJRU5ErkJggg=="
                )
                raw_rv = _post({
                    "model": model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "What color is this image? Answer in one word."},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{red_png_b64}"}},
                        ]
                    }],
                    "max_tokens": 32,
                    "temperature": 0,
                })
                choices_rv = raw_rv.get("choices", [])
                if choices_rv:
                    msg_rv = choices_rv[0].get("message", {})
                    rv_content = _extract_message_content(msg_rv).strip()
                    usage_rv = raw_rv.get("usage", {})
                    image_tokens = (
                        usage_rv.get("image_tokens", 0)
                        or usage_rv.get("prompt_tokens_details", {}).get("image_tokens", 0)
                        or 0
                    )
                    evasive_phrases = [
                        "cannot see", "can't see", "don't see", "unable to see",
                        "no image", "not see", "cannot view", "don't have access",
                        "no visual", "not able to", "cannot access", "i'd be happy to help",
                        "没有图片", "看不到", "无法看到", "无法识别", "没有看到",
                        "抱歉", "无法", "不能",
                    ]
                    rv_lower = rv_content.lower()
                    is_evasive = any(p in rv_lower for p in evasive_phrases)
                    if image_tokens > 0 and rv_content and not is_evasive:
                        detected_caps.append("vision")
            except Exception as e:
                logger.debug(f"Model {model} vision probe error: {e}")

            # ===== Step 5: probe function_calling =====
            fc_format_ok = False
            try:
                raw_fc = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Use the calc tool to add 2 and 3"}],
                    "tools": [{
                        "type": "function",
                        "function": {
                            "name": "calc",
                            "description": "Add two numbers",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "a": {"type": "number"},
                                    "b": {"type": "number"}
                                },
                                "required": ["a", "b"]
                            }
                        }
                    }],
                    "max_tokens": 64,
                    "temperature": 0,
                })
                choices_fc = raw_fc.get("choices", [])
                if choices_fc:
                    msg_fc = choices_fc[0].get("message", {})
                    tool_calls = msg_fc.get("tool_calls") or []
                    if tool_calls:
                        detected_caps.append("function_calling")
                        tc0 = tool_calls[0]
                        has_id = bool(tc0.get("id"))
                        has_type = tc0.get("type") == "function"
                        func = tc0.get("function") or {}
                        has_name = bool(func.get("name"))
                        args = func.get("arguments", "")
                        has_args = isinstance(args, str) and len(args) > 2
                        fc_format_ok = has_id and has_type and has_name and has_args
            except Exception as e:
                logger.debug(f"Model {model} function_calling probe error: {e}")

            # ===== Step 5b: probe json_mode =====
            json_mode_ok = False
            try:
                raw_jm = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "What is 2+3? Reply with JSON: {\"answer\": 5}"}],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 64,
                    "temperature": 0,
                })
                choices_jm = raw_jm.get("choices", [])
                if choices_jm:
                    msg_jm = choices_jm[0].get("message", {})
                    jm_content = (msg_jm.get("content") or "").strip()
                    if jm_content.startswith("{") or jm_content.startswith("```"):
                        json_mode_ok = True
            except Exception as e:
                logger.debug(f"Model {model} json_mode probe error: {e}")

            # ===== Step 6: probe long_context + context_window =====
            context_window_tested = None
            try:
                test_sizes = [2000, 4000, 8000, 16000, 32000, 65000, 131072]
                base_sentence = "The quick brown fox jumps over the lazy dog. "
                for sz in test_sizes:
                    n = sz // len(base_sentence) + 1
                    big_block = base_sentence * n
                    try:
                        raw_lc = _post({
                            "model": model,
                            "messages": [{"role": "user", "content": big_block + "\nWhat animal jumps? One word."}],
                            "max_tokens": 10,
                            "temperature": 0,
                        }, timeout=8)
                        choices_lc = raw_lc.get("choices", [])
                        if choices_lc:
                            finish = choices_lc[0].get("finish_reason", "")
                            if finish == "stop":
                                context_window_tested = sz
                            else:
                                break
                        else:
                            break
                    except Exception:
                        break
                if context_window_tested and context_window_tested >= 4000:
                    detected_caps.append("long_context")
            except Exception as e:
                logger.debug(f"Model {model} long_context probe error: {e}")

            # Always has chat
            if "chat" not in detected_caps:
                detected_caps.insert(0, "chat")

            # Deduplicate while preserving order
            seen = set()
            unique_caps = []
            for c in detected_caps:
                if c not in seen:
                    seen.add(c)
                    unique_caps.append(c)

            return {
                "success": True,
                "response": content.strip(),
                "latency_ms": latency_ms,
                "ttft_ms": ttft_ms,
                "streaming": streaming_ok,
                "json_mode": json_mode_ok,
                "context_window_tested": context_window_tested,
                "capabilities": unique_caps,
            }

        try:
            return await asyncio.wait_for(asyncio.to_thread(_do_test), timeout=120)
        except asyncio.TimeoutError:
            logger.warning(f"模型测试超时: {model} @ {chat_url}")
            return {"success": False, "error": "验证超时(>120s)，模型响应过慢"}
        except Exception as e:
            logger.warning(f"模型测试失败: {model} @ {chat_url} — {e}")
            return {"success": False, "error": str(e)}

    # ===== Token Stats API =====

