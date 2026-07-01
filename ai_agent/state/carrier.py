"""
载体适配器 — 多载体接口

WebUI → WebSocket 推送
CLI → 终端输出
API → 缓存快照（不推送）
"""
import json
from typing import Any, Dict, Optional


class CarrierAdapter:
    """载体适配器基类"""

    async def send_state_full(self, state: dict):
        raise NotImplementedError

    async def send_state_deltas(self, from_ver: int, to_ver: int, changes: list):
        raise NotImplementedError

    async def send_stream_delta(self, delta: str, session_id: str):
        raise NotImplementedError

    async def send_stream_end(self, data: dict):
        raise NotImplementedError

    async def send_tool_progress(self, tool: dict):
        raise NotImplementedError

    async def send(self, msg: dict):
        await self._send(msg)

    async def _send(self, msg: dict):
        raise NotImplementedError


class WebUIAdapter(CarrierAdapter):
    """Web UI 适配器 — 通过 WebSocket 推送"""

    def __init__(self, ws):
        self.ws = ws

    async def _send(self, msg: dict):
        await self.ws.send(json.dumps(msg, ensure_ascii=False, default=str))

    async def send_state_full(self, state: dict):
        await self._send({"type": "state_full", "version": state["version"], "data": state})

    async def send_state_deltas(self, from_ver: int, to_ver: int, changes: list):
        await self._send({"type": "state_deltas", "from_version": from_ver, "to_version": to_ver, "changes": changes})

    async def send_stream_delta(self, delta: str, session_id: str):
        await self._send({"type": "stream_delta", "delta": delta, "session_id": session_id})

    async def send_stream_end(self, data: dict):
        await self._send({"type": "stream_end", "data": data})

    async def send_tool_progress(self, tool: dict):
        await self._send({"type": "tool_progress", **tool})


class CLIAdapter(CarrierAdapter):
    """CLI 适配器 — 终端输出"""

    async def _send(self, msg: dict):
        msg_type = msg.get("type", "")
        if msg_type == "stream_delta":
            print(msg.get("delta", ""), end="", flush=True)
        elif msg_type == "stream_end":
            print()
        elif msg_type == "tool_progress":
            icon = "⏳" if msg.get("status") == "running" else "✅"
            print(f"  {icon} {msg.get('tool_name', '')}")

    async def send_state_full(self, state: dict):
        print(f"[CLI] Session: {state.get('active_session_id', 'none')}")

    async def send_state_deltas(self, from_ver: int, to_ver: int, changes: list):
        pass

    async def send_stream_delta(self, delta: str, session_id: str):
        await self._send({"type": "stream_delta", "delta": delta})

    async def send_stream_end(self, data: dict):
        await self._send({"type": "stream_end"})

    async def send_tool_progress(self, tool: dict):
        await self._send(tool)


class APIAdapter(CarrierAdapter):
    """API 适配器 — 缓存快照，不推送"""

    def __init__(self):
        self._snapshot = {}

    async def _send(self, msg: dict):
        pass

    async def send_state_full(self, state: dict):
        self._snapshot = state

    async def send_state_deltas(self, from_ver: int, to_ver: int, changes: list):
        for c in changes:
            if c["op"] == "replace":
                self._apply(c["path"], c["value"])

    def get_snapshot(self) -> dict:
        return self._snapshot

    def _apply(self, path: str, value):
        parts = path.split(".")
        obj = self._snapshot
        for p in parts[:-1]:
            obj = obj.setdefault(p, {})
        obj[parts[-1]] = value


class CarrierManager:
    """载体管理器"""

    def __init__(self):
        self._carriers: Dict[str, CarrierAdapter] = {}

    def add(self, conn_id: str, adapter: CarrierAdapter):
        self._carriers[conn_id] = adapter

    def remove(self, conn_id: str):
        self._carriers.pop(conn_id, None)

    def get(self, conn_id: str) -> Optional[CarrierAdapter]:
        return self._carriers.get(conn_id)

    @property
    def count(self) -> int:
        return len(self._carriers)
