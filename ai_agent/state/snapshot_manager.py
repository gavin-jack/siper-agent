"""
DOM 快照管理器 — 单一数据源

职责：
  维护前端 DOM 状态的完整镜像
  提供 set/batch_set/insert/remove 操作
  自动计算 delta → 50ms 批量推送
  会话历史截断 + 页面缓存 TTL + 快照大小控制
"""
import asyncio
import copy
import json
import time
from typing import Any, Dict, List, Optional, Tuple


class SnapshotManager:
    """DOM 快照管理器"""

    def __init__(self):
        self._snap = self._empty()
        self._version = 0
        self._lock = asyncio.Lock()
        self._deltas: list = []
        self._max_deltas = 500
        self._clients: Dict[str, Any] = {}
        self._pending: list = []
        self._batch_timer: Optional[asyncio.Task] = None
        self._batch_ms = 50

        # 内存控制常量
        self.MAX_SNAPSHOT_BYTES = 500_000
        self.MAX_CONVERSATION_HISTORY = 50
        self.MAX_SESSION_LIST = 50
        self.MAX_THINKING_STEPS = 20
        self.CACHE_TTL = 30
        self.CACHE_MAX_BYTES = 200_000

    def _empty(self) -> dict:
        return {
            "version": 0, "timestamp": "",
            # 层1：常驻
            "current_page": "chat", "sidebar_expanded": True, "sidebar_search": "",
            "active_session_id": None, "chat_header_name": "",
            "is_streaming": False, "stream_text": "", "stream_session_id": None,
            "is_thinking": False, "thinking_text": "", "is_sending": False,
            "input_text": "", "toasts": [], "dialog": None,
            # 层2：活跃数据
            "sessions": [], "messages": [], "agents": [],
            "expanded_agents": [], "thinking_steps": [],
            # 层3：页面缓存
            "page_cache": {}, "_cache_ts": {},
        }

    # ===== 快照操作 =====

    async def set(self, path: str, value: Any):
        """设置路径值 → 版本+1 → delta → 推送"""
        async with self._lock:
            old = self._resolve(path)
            if _deep_equal(old, value):
                return
            self._assign(path, value)
            self._bump()
            delta = {"op": "replace", "path": path, "value": value}
            self._record(delta)
        await self._enqueue(delta)
        await self._check_size()

    async def batch_set(self, pairs: List[Tuple[str, Any]]):
        """批量设置 [(path, value), ...]"""
        deltas = []
        async with self._lock:
            for path, value in pairs:
                old = self._resolve(path)
                if _deep_equal(old, value):
                    continue
                self._assign(path, value)
                deltas.append({"op": "replace", "path": path, "value": value})
            if not deltas:
                return
            self._bump()
            for d in deltas:
                self._record(d)
        for d in deltas:
            await self._enqueue(d)
        await self._check_size()

    async def insert(self, path: str, index: int, value: Any):
        async with self._lock:
            lst = self._resolve(path)
            lst.insert(index, value)
            self._bump()
            delta = {"op": "insert", "path": path, "index": index, "value": value}
            self._record(delta)
        await self._enqueue(delta)

    async def remove_at(self, path: str, index: int):
        async with self._lock:
            lst = self._resolve(path)
            lst.pop(index)
            self._bump()
            delta = {"op": "remove", "path": path, "index": index}
            self._record(delta)
        await self._enqueue(delta)

    # ===== 推送控制 =====

    async def _enqueue(self, delta: dict):
        self._pending.append(delta)
        if self._batch_timer:
            self._batch_timer.cancel()
        loop = asyncio.get_event_loop()
        self._batch_timer = loop.create_task(self._flush())

    async def _flush(self):
        await asyncio.sleep(self._batch_ms / 1000)
        async with self._lock:
            if not self._pending:
                return
            batch = self._pending.copy()
            self._pending.clear()
        await self._broadcast({
            "type": "state_delta",
            "version": self._version,
            "changes": batch,
        })

    # ===== 客户端管理 =====

    async def register(self, conn_id: str, adapter: Any):
        """新连接 → 发全量快照"""
        self._clients[conn_id] = adapter
        await adapter.send_state_full(self.get_snapshot())

    async def register_resumed(self, conn_id: str, adapter: Any, last_ver: int):
        """断线重连 → 补发缺失 deltas 或全量"""
        self._clients[conn_id] = adapter
        if last_ver <= 0 or (self._version - last_ver > 100):
            await adapter.send_state_full(self.get_snapshot())
        else:
            missing = self._deltas[last_ver:]
            if missing:
                await adapter.send_state_deltas(last_ver, self._version, missing)
            else:
                await adapter.send_state_full(self.get_snapshot())

    async def unregister(self, conn_id: str):
        self._clients.pop(conn_id, None)

    async def _broadcast(self, msg: dict):
        dead = []
        for cid, adapter in self._clients.items():
            try:
                await adapter._send(msg)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self._clients.pop(cid, None)

    # ===== 会话历史截断 =====

    async def add_message(self, session_id: str, message: dict):
        """添加消息到快照，自动截断"""
        async with self._lock:
            msgs = self._snap["messages"]
            msgs.append(message)
            if len(msgs) > self.MAX_CONVERSATION_HISTORY:
                system = [m for m in msgs if m.get("role") == "system"]
                recent = msgs[-(self.MAX_CONVERSATION_HISTORY - len(system)):]
                self._snap["messages"] = system + recent

    async def set_messages(self, messages: list):
        """设置消息列表（自动截断）"""
        if len(messages) > self.MAX_CONVERSATION_HISTORY:
            system = [m for m in messages if m.get("role") == "system"]
            recent = messages[-(self.MAX_CONVERSATION_HISTORY - len(system)):]
            messages = system + recent
        await self.set("messages", messages)

    # ===== 页面缓存 =====

    async def get_page_cache(self, page: str) -> dict:
        """获取页面缓存（TTL 淘汰）"""
        async with self._lock:
            cache = self._snap["page_cache"]
            ts = self._snap["_cache_ts"]
            now = time.time()
            if page in cache and now - ts.get(page, 0) > self.CACHE_TTL:
                del cache[page]
                ts.pop(page, None)
            return cache.get(page, {})

    async def set_page_cache(self, page: str, data: dict):
        """设置页面缓存"""
        async with self._lock:
            self._snap["page_cache"][page] = data
            self._snap["_cache_ts"][page] = time.time()

    async def clear_page_cache(self, page: str):
        """清除指定页面的缓存"""
        async with self._lock:
            self._snap["page_cache"].pop(page, None)
            self._snap["_cache_ts"].pop(page, None)

    # ===== 快照大小控制 =====

    async def _check_size(self):
        """检查快照大小，超出则淘汰"""
        size = self._estimate_size()
        if size > self.MAX_SNAPSHOT_BYTES:
            await self._evict()

    async def _evict(self):
        """淘汰：清 page_cache → 截断 messages → 截断 sessions"""
        snap = self._snap
        snap["page_cache"].clear()
        snap["_cache_ts"].clear()
        if len(snap["messages"]) > 20:
            system = [m for m in snap["messages"] if m.get("role") == "system"]
            snap["messages"] = system + snap["messages"][-20:]
        if len(snap["sessions"]) > 30:
            snap["sessions"] = snap["sessions"][:30]

    def _estimate_size(self) -> int:
        return len(json.dumps(self._snap, ensure_ascii=False, default=str))

    # ===== 工具方法 =====

    def get_snapshot(self) -> dict:
        return copy.deepcopy(self._snap)

    @property
    def version(self) -> int:
        return self._version

    def _bump(self):
        self._version += 1
        self._snap["version"] = self._version
        self._snap["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    def _record(self, delta: dict):
        self._deltas.append(delta)
        if len(self._deltas) > self._max_deltas:
            self._deltas = self._deltas[-self._max_deltas:]

    def _resolve(self, path: str) -> Any:
        parts = self._parse_path(path)
        obj = self._snap
        for p in parts:
            obj = obj[p]
        return obj

    def _assign(self, path: str, value: Any):
        parts = self._parse_path(path)
        obj = self._snap
        for p in parts[:-1]:
            obj = obj[p]
        obj[parts[-1]] = value

    @staticmethod
    def _parse_path(path: str) -> list:
        parts = []
        for seg in path.split('.'):
            if '[' in seg:
                key, idx = seg.split('[')
                parts.append(key)
                parts.append(int(idx.rstrip(']')))
            else:
                parts.append(seg)
        return parts


def _deep_equal(a: Any, b: Any) -> bool:
    """深度比较（处理 list/dict 内容相等）"""
    if type(a) != type(b):
        return False
    if isinstance(a, dict):
        if set(a.keys()) != set(b.keys()):
            return False
        return all(_deep_equal(a[k], b[k]) for k in a)
    if isinstance(a, list):
        if len(a) != len(b):
            return False
        return all(_deep_equal(x, y) for x, y in zip(a, b))
    return a == b
