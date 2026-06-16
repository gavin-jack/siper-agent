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
import os
import time
from typing import Any, Dict, List, Optional, Tuple

_SNAPSHOT_DB_PATH = os.path.join(os.path.dirname(__file__), "snapshot.db")


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
        self._dirty = False  # 标记是否有未持久化的变更

        # 内存控制常量
        self.MAX_SNAPSHOT_BYTES = 500_000
        self.MAX_CONVERSATION_HISTORY = 50
        self.MAX_SESSION_LIST = 50
        self.MAX_THINKING_STEPS = 20
        self.CACHE_TTL = 30
        self.CACHE_MAX_BYTES = 200_000
        self.CACHE_WHITELIST = ["memory", "agent_config", "theme", "monitor"]

        # 启动时从 SQLite 恢复
        self._load_from_db()

    # ===== 持久化（SQLite） =====

    def _db_init(self):
        """初始化 SQLite 数据库"""
        import sqlite3
        conn = sqlite3.connect(_SNAPSHOT_DB_PATH)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at REAL)")
        conn.commit()
        conn.close()

    def _load_from_db(self):
        """启动时从 SQLite 恢复快照"""
        import sqlite3
        self._db_init()
        try:
            conn = sqlite3.connect(_SNAPSHOT_DB_PATH)
            row = conn.execute("SELECT data FROM snapshot WHERE id=1").fetchone()
            conn.close()
            if row:
                data = json.loads(row[0])
                # 只恢复 page_cache 和版本号（会话数据由 session_sync 重建）
                if "page_cache" in data:
                    self._snap["page_cache"] = data["page_cache"]
                if "_cache_ts" in data:
                    self._snap["_cache_ts"] = data.get("_cache_ts", {})
                if "version" in data:
                    self._version = data["version"]
                    self._snap["version"] = self._version
                if "current_page" in data:
                    self._snap["current_page"] = data["current_page"]
                if "active_session_id" in data:
                    self._snap["active_session_id"] = data["active_session_id"]
                if "sidebar_expanded" in data:
                    self._snap["sidebar_expanded"] = data["sidebar_expanded"]
        except Exception as e:
            import logging
            logging.warning(f"[SnapshotManager] load_from_db failed: {e}")

    def _save_to_db(self):
        """将快照持久化到 SQLite（仅保存轻量数据）"""
        import sqlite3
        try:
            # 只持久化 page_cache + 轻量状态（不存 messages/sessions 等大对象）
            persist = {
                "version": self._version,
                "current_page": self._snap.get("current_page", "chat"),
                "active_session_id": self._snap.get("active_session_id"),
                "sidebar_expanded": self._snap.get("sidebar_expanded", True),
                "page_cache": self._snap.get("page_cache", {}),
                "_cache_ts": self._snap.get("_cache_ts", {}),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            conn = sqlite3.connect(_SNAPSHOT_DB_PATH)
            conn.execute("INSERT OR REPLACE INTO snapshot (id, data, updated_at) VALUES (1, ?, ?)",
                         (json.dumps(persist, ensure_ascii=False, default=str), time.time()))
            conn.commit()
            conn.close()
            self._dirty = False
        except Exception as e:
            import logging
            logging.error(f"[SnapshotManager] save_to_db failed: {e}")

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
            self._dirty = True
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
            self._dirty = True
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

    # ===== 持久化定时器 =====

    def start_periodic_save(self, interval: float = 5.0):
        """启动定时持久化（每 interval 秒检查 _dirty 并写入 SQLite）"""
        loop = asyncio.get_event_loop()
        self._save_task = loop.create_task(self._periodic_save_loop(interval))
        self._gc_counter = 0

    async def _periodic_save_loop(self, interval: float):
        try:
            while True:
                await asyncio.sleep(interval)
                self._gc_counter += 1
                # 每 30s (6×5s) 执行一次 gc
                if self._gc_counter >= 6:
                    await self.gc()
                    self._gc_counter = 0
                if self._dirty:
                    self._save_to_db()
        except asyncio.CancelledError:
            pass

    async def shutdown(self):
        """关闭前强制写入"""
        if self._dirty:
            self._save_to_db()
        if hasattr(self, '_save_task'):
            self._save_task.cancel()

    # ===== 垃圾回收 =====

    async def gc(self):
        """清理已消费数据，防止内存随运行时间增长"""
        async with self._lock:
            # 1. 截断 _deltas（只保留最近 100 条）
            if len(self._deltas) > 100:
                self._deltas = self._deltas[-100:]
            # 2. 清空 thinking_steps（瞬态数据）
            if self._snap.get("thinking_steps"):
                self._snap["thinking_steps"] = []
            # 3. 清空 toasts（已显示的通知）
            if self._snap.get("toasts"):
                self._snap["toasts"] = []
            # 4. 清空 dialog（对话框关闭后应清空）
            if self._snap.get("dialog"):
                self._snap["dialog"] = None
            self._dirty = True

    # ===== 启动预填充 =====

    async def hot_start(self, agent):
        """服务启动时从 DB 预填充内存，不等 WS 连接."""
        from ai_agent.state.session_sync import (
            sync_agents, sync_sessions, sync_memory, sync_agent_configs, sync_system_stats,
        )
        _agents = sync_agents(self)
        await self.set("agents", _agents)
        _sessions = sync_sessions(self, agent)
        await self.set("sessions", _sessions)
        _expanded = [a["name"] for a in _agents if a.get("expanded", True)]
        await self.set("expanded_agents", _expanded)
        _memory_data = sync_memory(self, agent)
        await self.set_page_cache("memory", _memory_data)
        _config_data = sync_agent_configs(self, agent)
        await self.set_page_cache("agent_config", _config_data)
        _stats_data = await sync_system_stats(self, agent)
        await self.set_page_cache("monitor", _stats_data)

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
        """新连接 → 发全量快照（排除 page_cache，页面数据由 _push_page_data 按需推送）"""
        self._clients[conn_id] = adapter
        await self._send_snapshot(adapter)

    async def register_resumed(self, conn_id: str, adapter: Any, last_ver: int):
        """断线重连 → 补发缺失 deltas 或全量"""
        self._clients[conn_id] = adapter
        if last_ver <= 0 or (self._version - last_ver > 100):
            await self._send_snapshot(adapter)
        else:
            missing = self._deltas[last_ver:]
            if missing:
                await adapter.send_state_deltas(last_ver, self._version, missing)
            else:
                await self._send_snapshot(adapter)

    async def _send_snapshot(self, adapter: Any):
        """发送全量快照（排除 page_cache，页面数据由 _push_page_data 按需推送）"""
        snap = self.get_snapshot()
        snap.pop("page_cache", None)
        snap.pop("_cache_ts", None)
        await adapter.send_state_full(snap)

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
            self._dirty = True

    async def clear_page_cache(self, page: str):
        """清除指定页面的缓存"""
        async with self._lock:
            self._snap["page_cache"].pop(page, None)
            self._snap["_cache_ts"].pop(page, None)

    async def clear_all_page_cache(self):
        """清空所有页面缓存"""
        async with self._lock:
            self._snap["page_cache"].clear()
            self._snap["_cache_ts"].clear()

    async def evict_stale_page_cache(self, current_page: str, whitelist: Optional[List[str]] = None):
        """清除过期页面缓存，只保留白名单和当前页面的缓存.

        Args:
            current_page: 当前页面名称，不会被清除.
            whitelist: 额外保留的页面键列表，默认为 self.CACHE_WHITELIST.
        """
        if whitelist is None:
            whitelist = self.CACHE_WHITELIST
        keep = {current_page, *whitelist}
        async with self._lock:
            stale = [k for k in self._snap["page_cache"] if k not in keep]
            for k in stale:
                self._snap["page_cache"].pop(k, None)
                self._snap["_cache_ts"].pop(k, None)

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
