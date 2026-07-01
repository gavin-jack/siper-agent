"""
推送协议 v2 — 消息类型定义

后端 → 前端：state_full / state_delta / stream_delta / stream_end / tool_progress / toast / dialog
前端 → 后端：message / stop / new_session / navigate / clarify_response / ping
"""
from enum import Enum
from typing import Any, Dict, List, Optional


class MsgType(str, Enum):
    # 后端 → 前端
    STATE_FULL = "state_full"
    STATE_DELTA = "state_delta"
    STATE_DELTAS = "state_deltas"
    STREAM_DELTA = "stream_delta"
    STREAM_END = "stream_end"
    TOOL_PROGRESS = "tool_progress"
    TOAST = "toast"
    DIALOG = "dialog"
    ERROR = "error"
    CONNECTED = "connected"
    SESSION_CREATED = "session_created"
    QUEUE_STATUS = "queue_status"
    STOPPED = "stopped"

    # 前端 → 后端
    MESSAGE = "message"
    STOP = "stop"
    NEW_SESSION = "new_session"
    NAVIGATE = "navigate"
    CLARIFY_RESPONSE = "clarify_response"
    PING = "ping"


def make_state_full(snapshot: dict) -> dict:
    return {"type": MsgType.STATE_FULL, "version": snapshot["version"], "data": snapshot}


def make_state_delta(version: int, changes: list) -> dict:
    return {"type": MsgType.STATE_DELTA, "version": version, "changes": changes}


def make_state_deltas(from_ver: int, to_ver: int, changes: list) -> dict:
    return {"type": MsgType.STATE_DELTAS, "from_version": from_ver, "to_version": to_ver, "changes": changes}


def make_stream_delta(delta: str, session_id: str) -> dict:
    return {"type": MsgType.STREAM_DELTA, "delta": delta, "session_id": session_id}


def make_stream_end(session_id: str, data: dict) -> dict:
    return {"type": MsgType.STREAM_END, "session_id": session_id, "data": data}


def make_tool_progress(tool_name: str, status: str, info: dict, call_id: Optional[str] = None) -> dict:
    return {"type": MsgType.TOOL_PROGRESS, "tool_name": tool_name, "status": status, "info": info, "call_id": call_id}


def make_toast(toast_type: str, message: str, duration: int = 3000) -> dict:
    return {"type": MsgType.TOAST, "data": {"type": toast_type, "message": message[:200], "duration": duration}}


def make_dialog(dialog_type: str, title: str, **kwargs) -> dict:
    return {"type": MsgType.DIALOG, "data": {"type": dialog_type, "title": title[:100], **kwargs}}


def parse_ws_message(raw: str) -> dict:
    """解析前端发来的 WS 消息"""
    import json
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"type": "unknown"}
