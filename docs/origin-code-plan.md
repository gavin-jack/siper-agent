# 起源（Origin）— 详细代码开发方案

> 版本：v1.0.0-origin
> 设计时间：2026-07-28
> 基于：origin-complete-plan.md
> 代码基线：77a2f92

---

## 开发原则

1. **每步可回滚**：每步完成后 git commit，失败可 `git reset --hard`
2. **后端先行**：后端接口稳定后，前端对接
3. **样式零改动**：CSS 和 HTML 不动
4. **每步验证**：每步完成后启动服务验证

---

## Phase 0：基础设施

### Step 0.1：创建目录和文件骨架

**新建目录**：
```
ai_agent/state/
ai_agent/api/
ai_agent/db/
```

**新建文件**（全部为空骨架，只包含 import 和 class 定义）：

```
ai_agent/state/__init__.py
ai_agent/state/dom_snapshot.py
ai_agent/state/snapshot_manager.py
ai_agent/state/protocol.py
ai_agent/state/carrier.py
ai_agent/state/session_sync.py
ai_agent/api/__init__.py
ai_agent/api/router.py
ai_agent/api/handlers.py
ai_agent/db/__init__.py
ai_agent/db/manager.py
```

**改动量**：12 个空文件

**验证**：
```bash
python -c "from ai_agent.state.snapshot_manager import SnapshotManager; print('OK')"
```

---

### Step 0.2：dom_snapshot.py — 快照数据结构

**文件**：`ai_agent/state/dom_snapshot.py`（~60 行）

```python
"""
DOM 快照数据结构 — 后端状态权威的内存镜像
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class SessionSummary:
    """会话摘要 — 列表页展示用（~200 字节）"""
    session_id: str = ""
    agent_name: str = "default"
    agent_icon: str = "🎭"
    last_message: str = ""
    last_time: str = ""
    message_count: int = 0
    unread: bool = False
    title: str = ""


@dataclass
class MessageEntry:
    """消息条目 — 聊天展示用（~1KB）"""
    role: str = ""
    content: str = ""
    timestamp: str = ""
    meta: Optional[dict] = None


@dataclass
class AgentInfo:
    """智能体信息"""
    name: str = "default"
    icon: str = "🎭"
    display_name: str = "Default"
    model: str = ""
    active_sessions: int = 0


# ===== 页面缓存 =====
# 每个页面的缓存数据，TTL 30s
PageCache = Dict[str, Any]

# ===== 缓存时间戳 =====
CacheTs = Dict[str, float]
```

**验证**：
```bash
python -c "
from ai_agent.state.dom_snapshot import SessionSummary, MessageEntry, AgentInfo
s = SessionSummary(session_id='test', last_message='hello')
assert s.agent_icon == '🎭'
m = MessageEntry(role='user', content='hi')
assert m.meta is None
print('dom_snapshot OK')
"
```

---

### Step 0.3：snapshot_manager.py — 快照管理器

**文件**：`ai_agent/state/snapshot_manager.py`（~200 行）

```python
"""
DOM 快照管理器 — 单一数据源
"""
import asyncio
import copy
import json
import time
from typing import Any, Dict, List, Optional, Tuple


class SnapshotManager:
    """DOM 快照管理器 — 管理前端 DOM 状态的完整镜像"""

    def __init__(self):
        self._snap = self._empty()
        self._version = 0
        self._lock = asyncio.Lock()
        self._deltas: list = []
        self._max_deltas = 500
        self._clients: Dict[str, Any] = {}  # conn_id → CarrierAdapter
        self._pending: list = []
        self._batch_timer: Optional[asyncio.Task] = None
        self._batch_ms = 50  # 50ms 批量窗口

        # 内存控制
        self.MAX_SNAPSHOT_BYTES = 500_000  # 500KB
        self.MAX_CONVERSATION_HISTORY = 50  # 最多 50 条消息
        self.MAX_SESSION_LIST = 50  # 最多 50 条会话摘要
        self.MAX_THINKING_STEPS = 20  # 最多 20 步思考

        # 页面缓存 TTL
        self.CACHE_TTL = 30  # 30 秒
        self.CACHE_MAX_BYTES = 200_000  # 200KB

    def _empty(self) -> dict:
        return {
            "version": 0,
            "timestamp": "",
            # 层 1：常驻
            "current_page": "chat",
            "sidebar_expanded": True,
            "sidebar_search": "",
            "active_session_id": None,
            "chat_header_name": "",
            "is_streaming": False,
            "stream_text": "",
            "stream_session_id": None,
            "is_thinking": False,
            "thinking_text": "",
            "is_sending": False,
            "input_text": "",
            "toasts": [],
            "dialog": None,
            # 层 2：活跃数据
            "sessions": [],
            "messages": [],
            "agents": [],
            "expanded_agents": [],
            "thinking_steps": [],
            # 层 3：页面缓存
            "page_cache": {},
            "_cache_ts": {},
        }

    # ---- 快照操作 ----

    async def set(self, path: str, value: Any):
        """设置路径值 → 更新版本 → 生成 delta → 推送"""
        async with self._lock:
            old = self._resolve(path)
            if old == value:
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
                if old == value:
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

    # ---- 推送控制 ----

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

    # ---- 客户端管理 ----

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

    # ---- 会话历史截断 ----

    async def add_message(self, session_id: str, message: dict):
        """添加消息到快照，自动截断"""
        async with self._lock:
            msgs = self._snap["messages"]
            msgs.append(message)
            # 截断：保留 system prompt + 最新消息
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

    # ---- 页面缓存 ----

    async def get_page_cache(self, page: str) -> dict:
        """获取页面缓存（TTL 淘汰）"""
        async with self._lock:
            cache = self._snap["page_cache"]
            ts = self._snap["_cache_ts"]
            now = time.time()

            # 检查 TTL
            if page in cache and now - ts.get(page, 0) > self.CACHE_TTL:
                del cache[page]
                del ts[page]

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

    # ---- 快照大小控制 ----

    async def _check_size(self):
        """检查快照大小，超出则淘汰"""
        size = self._estimate_size()
        if size > self.MAX_SNAPSHOT_BYTES:
            await self._evict()

    async def _evict(self):
        """淘汰策略：清 page_cache → 截断 messages → 截断 sessions"""
        snap = self._snap
        # 1. 清空页面缓存
        snap["page_cache"].clear()
        snap["_cache_ts"].clear()
        # 2. 截断消息
        if len(snap["messages"]) > 20:
            system = [m for m in snap["messages"] if m.get("role") == "system"]
            snap["messages"] = system + snap["messages"][-20:]
        # 3. 截断会话列表
        if len(snap["sessions"]) > 30:
            snap["sessions"] = snap["sessions"][:30]

    def _estimate_size(self) -> int:
        return len(json.dumps(self._snap, ensure_ascii=False, default=str))

    def get_snapshot(self) -> dict:
        return copy.deepcopy(self._snap)

    # ---- 工具方法 ----

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
```

**验证**：
```bash
python -c "
import asyncio
from ai_agent.state.snapshot_manager import SnapshotManager

async def test():
    mgr = SnapshotManager()
    await mgr.set('current_page', 'sessions')
    s = mgr.get_snapshot()
    assert s['current_page'] == 'sessions'
    assert s['version'] == 1
    await mgr.set('sidebar_expanded', False)
    assert mgr.get_snapshot()['sidebar_expanded'] == False
    # 测试截断
    for i in range(60):
        await mgr.add_message('test', {'role': 'user', 'content': f'msg{i}'})
    assert len(mgr.get_snapshot()['messages']) <= 50
    print(f'SnapshotManager OK: v{mgr._version}, {len(mgr.get_snapshot()[\"messages\"])} msgs')

asyncio.run(test())
"
```

---

### Step 0.4：protocol.py — 推送协议

**文件**：`ai_agent/state/protocol.py`（~100 行）

```python
"""
推送协议 v2 — 消息类型定义
"""
from enum import Enum


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
    return {
        "type": MsgType.STATE_FULL,
        "version": snapshot["version"],
        "data": snapshot,
    }


def make_state_delta(version: int, changes: list) -> dict:
    return {
        "type": MsgType.STATE_DELTA,
        "version": version,
        "changes": changes,
    }


def make_state_deltas(from_ver: int, to_ver: int, changes: list) -> dict:
    return {
        "type": MsgType.STATE_DELTAS,
        "from_version": from_ver,
        "to_version": to_ver,
        "changes": changes,
    }


def make_stream_delta(delta: str, session_id: str) -> dict:
    return {
        "type": MsgType.STREAM_DELTA,
        "delta": delta,
        "session_id": session_id,
    }


def make_stream_end(session_id: str, data: dict) -> dict:
    return {
        "type": MsgType.STREAM_END,
        "session_id": session_id,
        "data": data,
    }


def make_tool_progress(tool_name: str, status: str, info: dict, call_id: str = None) -> dict:
    return {
        "type": MsgType.TOOL_PROGRESS,
        "tool_name": tool_name,
        "status": status,
        "info": info,
        "call_id": call_id,
    }


def make_toast(toast_type: str, message: str, duration: int = 3000) -> dict:
    return {
        "type": MsgType.TOAST,
        "data": {"type": toast_type, "message": message[:200], "duration": duration},
    }


def make_dialog(dialog_type: str, title: str, **kwargs) -> dict:
    return {
        "type": MsgType.DIALOG,
        "data": {"type": dialog_type, "title": title[:100], **kwargs},
    }


def parse_ws_message(raw: str) -> dict:
    """解析前端发来的 WS 消息"""
    import json
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"type": "unknown"}
```

**验证**：
```bash
python -c "
from ai_agent.state.protocol import *
assert make_state_full({'version': 1})['type'] == 'state_full'
assert make_stream_delta('hello', 's1')['delta'] == 'hello'
assert make_toast('success', 'ok')['data']['type'] == 'success'
assert parse_ws_message('{\"type\":\"ping\"}')['type'] == 'ping'
print('protocol OK')
"
```

---

### Step 0.5：carrier.py — 载体适配器

**文件**：`ai_agent/state/carrier.py`（~150 行）

```python
"""
载体适配器 — 多载体接口
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
        """统一发送入口"""
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
        pass  # CLI 不需要增量更新

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
        pass  # API 不推送

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
```

**验证**：
```bash
python -c "
from ai_agent.state.carrier import WebUIAdapter, CLIAdapter, APIAdapter, CarrierManager
cm = CarrierManager()
assert cm.count == 0
cm.add('c1', CLIAdapter())
assert cm.count == 1
cm.remove('c1')
assert cm.count == 0
print('carrier OK')
"
```

---

### Step 0.6：router.py — HTTP 路由注册器

**文件**：`ai_agent/api/router.py`（~60 行）

```python
"""
HTTP 路由注册器
"""
from typing import Any, Callable, Dict, List, Optional, Tuple


class Router:
    """HTTP 路由注册器"""

    def __init__(self, prefix: str = "/api/v1"):
        self.prefix = prefix
        self._routes: List[Tuple[str, str, Callable]] = []

    def get(self, path: str):
        def deco(fn):
            self._routes.append(("GET", self.prefix + path, fn))
            return fn
        return deco

    def post(self, path: str):
        def deco(fn):
            self._routes.append(("POST", self.prefix + path, fn))
            return fn
        return deco

    def put(self, path: str):
        def deco(fn):
            self._routes.append(("PUT", self.prefix + path, fn))
            return fn
        return deco

    def delete(self, path: str):
        def deco(fn):
            self._routes.append(("DELETE", self.prefix + path, fn))
            return fn
        return deco

    def dispatch(self, method: str, path: str) -> Optional[Callable]:
        for m, p, fn in self._routes:
            if m == method and p == path:
                return fn
        return None

    @property
    def routes(self) -> List[Tuple[str, str, Callable]]:
        return self._routes.copy()


def ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 0, "data": data, "message": message}


def err(code: int, message: str) -> dict:
    return {"code": code, "data": None, "message": message}
```

**验证**：
```bash
python -c "
from ai_agent.api.router import Router, ok, err
r = Router()
@r.get('/test')
def test_handler(): return ok('hello')
assert r.dispatch('GET', '/api/v1/test') is not None
assert r.dispatch('POST', '/api/v1/test') is None
print('router OK')
"
```

---

### Step 0.7：manager.py — 数据库管理器

**文件**：`ai_agent/db/manager.py`（~50 行）

```python
"""
数据库管理器 — 统一连接管理
"""
import sqlite3
from pathlib import Path
from typing import Dict


class DatabaseManager:
    def __init__(self, root: Path):
        self._root = root
        self._conns: Dict[str, sqlite3.Connection] = {}

    def conn(self, name: str) -> sqlite3.Connection:
        if name not in self._conns:
            path = self._path(name)
            path.parent.mkdir(parents=True, exist_ok=True)
            c = sqlite3.connect(str(path), check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA cache_size=-8000")  # 8MB
            c.row_factory = sqlite3.Row
            self._conns[name] = c
        return self._conns[name]

    def _path(self, name: str) -> Path:
        return {
            "sessions": self._root / "agents" / "default" / "sessions" / "sessions.db",
            "models": self._root / "models.db",
            "token": self._root / "agents" / "token.db",
        }.get(name, self._root / f"{name}.db")

    def close_all(self):
        for conn in self._conns.values():
            try:
                conn.close()
            except Exception:
                pass
        self._conns.clear()
```

**验证**：
```bash
python -c "
from ai_agent.db.manager import DatabaseManager
from pathlib import Path
dm = DatabaseManager(Path('/home/gavin/.siper'))
c = dm.conn('sessions')
assert c is not None
print('db manager OK')
"
```

---

### Step 0.8：集成到 siper_web.py

**文件**：`siper_web.py`

**改动点**（共 5 处，约 30 行）：

1. **import 区域**（L337 附近，在现有 import 后添加）：
```python
# 起源：有状态 UI
from ai_agent.state.snapshot_manager import SnapshotManager
from ai_agent.state.carrier import WebUIAdapter, CarrierManager
from ai_agent.state.protocol import MsgType, make_state_full
from ai_agent.api.router import Router, ok
from ai_agent.db.manager import DatabaseManager
```

2. **全局变量区域**（L394 附近，在 `agent = None` 后添加）：
```python
# 起源：有状态 UI
snapshot_mgr: SnapshotManager = None
carrier_mgr: CarrierManager = None
api_router: Router = None
db_mgr: DatabaseManager = None
```

3. **`main()` 函数初始化**（在 `connections = {}` 之前）：
```python
    # 起源：初始化有状态 UI
    snapshot_mgr = SnapshotManager()
    carrier_mgr = CarrierManager()
    api_router = Router()
    db_mgr = DatabaseManager(PROJECT_ROOT)
```

4. **`ws_handler` 开头**（L3662 后，在 `connections[conn_id] = ws` 后添加）：
```python
        # 起源：注册载体适配器
        adapter = WebUIAdapter(ws)
        await snapshot_mgr.register(conn_id, adapter)
        carrier_mgr.add(conn_id, adapter)
```

5. **`ws_handler` finally 块**（L3778 前，在 `_msg_queues.pop` 之前添加）：
```python
            # 起源：注销载体适配器
            await snapshot_mgr.unregister(conn_id)
            carrier_mgr.remove(conn_id)
```

6. **`handle_request` 中添加快照端点**（在路由分发开头添加）：
```python
        # 起源：状态快照端点
        if method == "GET" and path == "/api/v1/state/snapshot":
            return ok(snapshot_mgr.get_snapshot())
```

**验证**：
```bash
# 启动服务后
curl -s http://localhost:9724/api/v1/state/snapshot | python -m json.tool | head -20
# 应返回完整 JSON 快照
```

---

### Step 0.9：session_sync.py — 状态同步

**文件**：`ai_agent/state/session_sync.py`（~100 行）

```python
"""
状态同步 — 从 DB/内存加载数据到快照
"""
import os
import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ai_agent.state.snapshot_manager import SnapshotManager


def sync_sessions(snapshot_mgr: "SnapshotManager", agent):
    """从 DB 加载会话列表 → 更新快照"""
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


def sync_agents(snapshot_mgr: "SnapshotManager"):
    """加载智能体列表 → 更新快照"""
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
        agents.append({
            "name": d.name,
            "icon": config.get("icon", "🎭"),
            "display_name": config.get("display_name", d.name),
            "model": config.get("model", ""),
        })
    return agents
```

---

### Step 0.10：__init__.py — 包导出

**文件**：`ai_agent/state/__init__.py`
```python
from ai_agent.state.snapshot_manager import SnapshotManager
from ai_agent.state.carrier import CarrierAdapter, WebUIAdapter, CLIAdapter, APIAdapter, CarrierManager
from ai_agent.state.protocol import MsgType, make_state_full, make_state_delta, parse_ws_message
from ai_agent.state.session_sync import sync_sessions, sync_agents

__all__ = [
    "SnapshotManager",
    "CarrierAdapter", "WebUIAdapter", "CLIAdapter", "APIAdapter", "CarrierManager",
    "MsgType", "make_state_full", "make_state_delta", "parse_ws_message",
    "sync_sessions", "sync_agents",
]
```

**文件**：`ai_agent/api/__init__.py`
```python
from ai_agent.api.router import Router, ok, err

__all__ = ["Router", "ok", "err"]
```

**文件**：`ai_agent/db/__init__.py`
```python
from ai_agent.db.manager import DatabaseManager

__all__ = ["DatabaseManager"]
```

---

### Step 0.11：Phase 0 集成验证

**验证步骤**：
1. `python -c "from ai_agent.state import SnapshotManager; print('import OK')"`
2. `python -c "from ai_agent.api import Router; print('import OK')"`
3. `python -c "from ai_agent.db import DatabaseManager; print('import OK')"`
4. 启动服务：`python siper_web.py`
5. `curl -s http://localhost:9724/api/v1/state/snapshot | python -m json.tool`
6. 浏览器打开 `http://localhost:9724` → 确认页面正常加载
7. 浏览器 DevTools → Network → WS → 确认连接成功

---

## Phase 1：聊天核心迁移

### Step 1.1：创建 core.js

**文件**：`webui/js/core.js`（新建，~80 行）

```javascript
/**
 * core.js — 前端核心：WS 连接 + 消息分发
 */
import { renderFull, applyDelta } from './renderer.js';

let ws = null;
let ver = 0;

export function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = parseInt(location.port) + 1;
    ws = new WebSocket(`${proto}//${location.hostname}:${wsPort}`);

    ws.onopen = () => {
        console.log('[core] WS connected');
    };

    ws.onmessage = (e) => {
        try {
            dispatch(JSON.parse(e.data));
        } catch (err) {
            console.error('[core] parse error:', err);
        }
    };

    ws.onclose = () => {
        console.warn('[core] WS closed, reconnect in 3s...');
        setTimeout(connectWS, 3000);
    };

    ws.onerror = (e) => {
        console.error('[core] WS error:', e);
    };
}

function dispatch(msg) {
    switch (msg.type) {
        case 'state_full':
            ver = msg.version;
            renderFull(msg.data);
            break;
        case 'state_delta':
            ver = msg.version;
            applyDelta(msg.changes);
            break;
        case 'state_deltas':
            ver = msg.to_version;
            applyDelta(msg.changes);
            break;
        case 'stream_delta':
            appendStream(msg.delta, msg.session_id);
            break;
        case 'stream_end':
            finalizeStream(msg.data);
            break;
        case 'tool_progress':
            updateToolCard(msg);
            break;
        case 'connected':
            console.log('[core] server connected:', msg.connection_id);
            break;
        case 'session_created':
            console.log('[core] new session:', msg.session_id);
            break;
        case 'error':
            console.error('[core] server error:', msg.message);
            break;
        default:
            console.warn('[core] unknown msg type:', msg.type);
    }
}

// 流式状态（临时，直到 stream_end）
let _streamAcc = '';
let _streamTextEl = null;
let _streamRenderTimer = null;

function appendStream(delta, sessionId) {
    if (!_streamTextEl) {
        // 首次：创建流式 DOM 结构
        const chatEl = document.getElementById('chatMessages');
        if (!chatEl) return;
        const row = document.createElement('div');
        row.className = 'siper-msg-row agent siper-stream-row';
        row.innerHTML = `
            <div class="siper-msg-avatar-wrap">
                <img class="msg-avatar-img" src="/api/avatar?agent=default" alt="Agent"
                     onerror="this.src='/static/default_avatar_256.png'">
            </div>
            <div class="siper-bubble agent-bubble">
                <div class="siper-msg-body">
                    <div class="siper-stream-text"></div>
                </div>
            </div>`;
        chatEl.appendChild(row);
        _streamTextEl = row.querySelector('.siper-stream-text');
    }
    _streamTextEl.textContent += delta;
    _streamAcc += delta;

    // 节流 Markdown 渲染
    if (!_streamRenderTimer) {
        _streamRenderTimer = setTimeout(() => {
            const bubble = _streamTextEl?.closest('.siper-bubble');
            if (bubble && typeof renderMarkdown === 'function') {
                bubble.innerHTML = '';
                bubble.appendChild(renderMarkdown(_streamAcc));
            }
            _streamRenderTimer = null;
        }, 200);
    }
}

function finalizeStream(data) {
    if (_streamRenderTimer) {
        clearTimeout(_streamRenderTimer);
        _streamRenderTimer = null;
    }
    _streamAcc = '';
    _streamTextEl = null;
    // 通知外部（chat.js 中的 stream_end 处理）
    if (typeof window.__onStreamEnd === 'function') {
        window.__onStreamEnd(data);
    }
}

function updateToolCard(msg) {
    if (typeof window.__onToolProgress === 'function') {
        window.__onToolProgress(msg);
    }
}

export function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

export function navigate(page) {
    send({ type: 'navigate', page });
}

export function newSession(agent) {
    send({ type: 'new_session', agent: agent || 'default' });
}

export function switchSession(sessionId) {
    send({ type: 'switch_session', session_id: sessionId });
}

export function stopGeneration() {
    send({ type: 'stop' });
}

export function sendMessage(content, sessionId, agent, model, images) {
    send({
        type: 'message',
        content,
        session_id: sessionId,
        agent: agent || 'default',
        model: model || '',
        images: images || [],
    });
}
```

---

### Step 1.2：创建 renderer.js

**文件**：`webui/js/renderer.js`（新建，~250 行）

```javascript
/**
 * renderer.js — 统一 DOM 渲染
 */

// ===== 路径 → 处理函数映射 =====
const handlers = {};

// 注册处理器
function register(path, fn) {
    handlers[path] = fn;
}

// 注册批量处理器（前缀匹配）
function registerPrefix(prefix, fn) {
    handlers[prefix] = fn;
}

// ===== 全量快照渲染 =====
export function renderFull(s) {
    // 按依赖顺序渲染
    if (handlers.current_page) handlers.current_page(s.current_page);
    if (handlers.sidebar_expanded) handlers.sidebar_expanded(s.sidebar_expanded);
    if (handlers.sidebar_search) handlers.sidebar_search(s.sidebar_search);
    if (handlers.active_session_id) handlers.active_session_id(s.active_session_id);
    if (handlers.chat_header_name) handlers.chat_header_name(s.chat_header_name);
    if (handlers.is_streaming) handlers.is_streaming(s.is_streaming);
    if (handlers.stream_text) handlers.stream_text(s.stream_text);
    if (handlers.is_thinking) handlers.is_thinking(s.is_thinking);
    if (handlers.thinking_text) handlers.thinking_text(s.thinking_text);
    if (handlers.is_sending) handlers.is_sending(s.is_sending);
    if (handlers.sessions) handlers.sessions(s.sessions);
    if (handlers.messages) handlers.messages(s.messages);
    if (handlers.agents) handlers.agents(s.agents);
    if (handlers.expanded_agents) handlers.expanded_agents(s.expanded_agents);
    if (handlers.thinking_steps) handlers.thinking_steps(s.thinking_steps);
    if (handlers.toasts) handlers.toasts(s.toasts);
    if (handlers.dialog) handlers.dialog(s.dialog);
}

// ===== 增量更新 =====
export function applyDelta(changes) {
    for (const c of changes) {
        if (c.op === 'replace') {
            // 精确匹配
            if (handlers[c.path]) {
                handlers[c.path](c.value);
                continue;
            }
            // 前缀匹配
            const prefix = c.path.replace(/\[\d+\].*/, '');
            if (handlers[prefix]) {
                handlers[prefix](c.value);
                continue;
            }
            // page_cache 更新
            if (c.path.startsWith('page_cache.')) {
                updatePageCache(c.path.slice(11), c.value);
                continue;
            }
            console.warn('[renderer] unhandled path:', c.path);
        } else if (c.op === 'insert') {
            const list = resolvePath(c.path);
            if (Array.isArray(list)) {
                list.splice(c.index, 0, c.value);
            }
        } else if (c.op === 'remove') {
            const list = resolvePath(c.path);
            if (Array.isArray(list)) {
                list.splice(c.index, 1);
            }
        }
    }
}

function resolvePath(path) {
    const parts = path.split('.');
    let obj = window;  // 全局
    for (const p of parts) {
        if (obj && typeof obj === 'object') {
            obj = obj[p];
        } else {
            return undefined;
        }
    }
    return obj;
}

function updatePageCache(path, value) {
    // 页面缓存更新（按需处理）
    console.debug('[renderer] page_cache update:', path);
}

// ===== 导出工具函数 =====
export { register, registerPrefix };
```

---

### Step 1.3：重写 app.js

**文件**：`webui/js/app.js`（重写，~20 行）

```javascript
/**
 * app.js — 入口
 */
import { connectWS } from './core.js';

// 启动 WS 连接
connectWS();

// 挂载全局函数（供 HTML onclick 调用）
import { send, navigate, newSession, switchSession, stopGeneration, sendMessage } from './core.js';
window.siPerSend = send;
window.siPerNavigate = navigate;
window.siPerNewSession = newSession;
window.siPerSwitchSession = switchSession;
window.siPerStop = stopGeneration;
window.siPerSendMessage = sendMessage;
```

**注意**：`index.html` 中的 `onclick` 调用需要从 `chatSendMessage()` 等改为 `siPerSendMessage()` 等。但由于方案要求 HTML 零改动，我们需要保留旧名称的兼容映射。

---

### Step 1.4：index.html 添加新 script 引用

**文件**：`webui/index.html`

在 `</head>` 前添加：
```html
  <!-- 起源：有状态 UI -->
  <script type="module" src="/js/core.js"></script>
  <script type="module" src="/js/renderer.js"></script>
```

**注意**：`app.js` 仍然保留（向后兼容），但 `core.js` 和 `renderer.js` 先加载。

---

### Step 1.5：后端消息处理集成快照

**文件**：`siper_web.py`

在 `_process_ws_message` 中集成快照更新：

1. **消息处理开始**（`_processing_events[conn_id].set()` 后）：
```python
            # 起源：更新快照
            await snapshot_mgr.set("is_sending", True)
            await snapshot_mgr.set("is_streaming", True)
```

2. **流式 delta 发送时**（`_send_stream_delta` 函数中）：
```python
            # 起源：更新快照中的流式文本
            await snapshot_mgr.set("stream_text", _stream_acc["text"][-2000:])
```

3. **流式完成时**（`stream_end` 发送前）：
```python
            # 起源：更新快照
            await snapshot_mgr.batch_set([
                ("is_streaming", False),
                ("stream_text", ""),
                ("is_sending", False),
            ])
```

4. **会话列表更新**（消息处理完成后）：
```python
            # 起源：同步会话列表
            sessions = sync_sessions(snapshot_mgr, agent)
            await snapshot_mgr.set("sessions", sessions)
```

---

### Step 1.6：验证 Phase 1

1. 启动服务
2. 浏览器打开 → 确认页面正常
3. 发送消息 → 确认流式输出
4. 检查 WS 消息：`state_full` → `state_delta` → `stream_delta` → `stream_end`
5. 检查 `/api/v1/state/snapshot` 返回完整 JSON

---

## Phase 2：独立页面迁移

### Step 2.1：dom.js 精简

**文件**：`webui/js/utils/dom.js`（1008 → 100 行）

**保留**：
- `escapeHtml()`
- `toast()` / `showToast()`
- `_sendClarifyResponse()` → 改为通过 WS 发送

**删除**：
- `navigateToPage()` → 由 `core.js` 的 `navigate()` 替代
- 所有 `tplMap` / `cloneNode` / `initRouter` 逻辑
- 所有 `refreshXxx()` 函数
- 所有 `fetch()` 调用
- `connectWS()` → 由 `core.js` 替代

**新增**：
```javascript
// 页面切换（通知后端）
export function switchToPage(page) {
    if (typeof window.siPerNavigate === 'function') {
        window.siPerNavigate(page);
    }
}
```

### Step 2.2-2.11：各页面精简

每个页面的改造模式相同：

1. **删除所有 `fetch()` 调用**
2. **删除所有 `refreshXxx()` 函数**
3. **保留纯渲染函数和 UI 交互逻辑**
4. **数据获取改为从 `window.__snapshot` 读取或通过 WS 推送**

以 `sessions.js` 为例：

**文件**：`webui/js/pages/sessions.js`（323 → 60 行）

```javascript
/**
 * sessions.js — 会话管理页面（纯渲染）
 */

// 渲染会话列表（从快照数据）
export function renderSessions(list) {
    const el = document.getElementById('sessionsList');
    if (!el) return;
    if (!list || list.length === 0) {
        el.innerHTML = '<div class="empty-state">暂无会话</div>';
        return;
    }
    el.innerHTML = list.map(s => `
        <div class="session-item ${s.unread ? 'unread' : ''}"
             data-sid="${s.session_id}"
             onclick="window.siPerSwitchSession('${s.session_id}')">
            <span class="agent-icon">${esc(s.agent_icon)}</span>
            <span class="session-last-msg">${esc(s.last_message)}</span>
            <span class="session-time">${s.last_time}</span>
        </div>
    `).join('');
}

// 渲染会话预览
export function renderSessionPreview(msgs) {
    const el = document.getElementById('sessionPreview');
    if (!el) return;
    if (!msgs || msgs.length === 0) {
        el.innerHTML = '<div class="empty-state">暂无消息</div>';
        return;
    }
    el.innerHTML = msgs.map(m => `
        <div class="message ${m.role}">
            <div class="bubble">${renderMarkdown(m.content)}</div>
        </div>
    `).join('');
}

// 兼容旧调用
window.renderSessions = renderSessions;
window.renderSessionPreview = renderSessionPreview;
```

其他页面按相同模式改造。

---

## Phase 3：API 重构

### Step 3.1：迁移 HTTP API

**文件**：`ai_agent/api/handlers.py`（新建，~400 行）

从 `siper_web.py` 迁移以下函数：
- `api_get_sessions()` → `handlers.py`
- `api_get_session_messages()` → `handlers.py`
- `api_delete_session()` → `handlers.py`
- `api_save_response_dict()` → `handlers.py`
- 其他 30+ 个 API 函数

**文件**：`siper_web.py`

在 `handle_request` 中添加路由分发：
```python
        # 起源：API v1 路由
        if path.startswith("/api/v1/"):
            handler = api_router.dispatch(method, path)
            if handler:
                result = await handler(request_body)
                return json_response(result)
```

---

## Phase 4：清理

### Step 4.1：删除废弃文件

```bash
rm webui/js/chat/state.js
rm webui/js/chat/stream.js
rm webui/js/utils/dom.js
```

### Step 4.2：清理 app.js

最终只保留：
```javascript
import { connectWS } from './core.js';
connectWS();
```

---

## 关键注意事项

### 1. 向后兼容

在过渡期间，旧代码和新代码共存：
- `app.js` 仍然加载（但只负责 WS 连接）
- `dom.js` 中的旧函数保留但标记为 `@deprecated`
- `state.js` 和 `stream.js` 保留但不使用

### 2. HTML 零改动

所有 `onclick` 调用保持不变，通过 `window` 全局映射兼容：
```javascript
// 旧调用 → 新函数
window.chatSendMessage = window.siPerSendMessage;
window.chatLoadSessionMessages = (sid) => { /* 从快照加载 */ };
```

### 3. CSS 零改动

所有 CSS 类名、选择器、变量保持不变。

### 4. 每步 Git Commit

```bash
git add -A
git commit -m "origin: Step X.X - <description>"
```

---

> **文档结束**
>
> 下一步：确认方案后按 Step 0.1 开始实施。
