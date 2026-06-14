# 起源（Origin）— SiPer v1.0.0 完整架构方案

> 代号：起源（Origin）
> 版本：v1.0.0-origin
> 设计时间：2026-07-28
> 代码基线：77a2f92（v0.6.7）
> 总代码量：Python 16102 行 + JS 10415 行 + CSS 4760 行 + HTML 420 行
> 目标：DOM 快照 + 数据库持久化，后端状态权威，前端纯展示，多载体互通

---

## 目录

### 第一部分：架构设计
1. [核心理念](#1-核心理念)
2. [架构全景](#2-架构全景)
3. [后端 DOM 快照管理器](#3-后端-dom-快照管理器)
4. [推送协议 v2](#4-推送协议-v2)

### 第二部分：内存优化
5. [当前内存热点分析](#5-当前内存热点分析)
6. [四层存储策略](#6-四层存储策略)
7. [每个字段的构建方式](#7-每个字段的构建方式)
8. [前端内存优化](#8-前端内存优化)
9. [后端内存优化](#9-后端内存优化)
10. [内存监控](#10-内存监控)
11. [内存预算](#11-内存预算)

### 第三部分：功能实现
12. [前端架构](#12-前端架构)
13. [HTTP API 重构](#13-http-api-重构)
14. [多载体适配](#14-多载体适配)
15. [跨平台策略](#15-跨平台策略)
16. [代码去重与简化](#16-代码去重与简化)
17. [数据存储重构](#17-数据存储重构)

### 第四部分：开发步骤
18. [Phase 0：基础设施](#18-phase-0基础设施)
19. [Phase 1：聊天核心迁移](#19-phase-1聊天核心迁移)
20. [Phase 2：独立页面迁移](#20-phase-2独立页面迁移)
21. [Phase 3：API 重构 + 去重](#21-phase-3api-重构--去重)
22. [Phase 4：清理与优化](#22-phase-4清理与优化)
23. [Phase 5：多载体 + 跨平台](#23-phase-5多载体--跨平台)

### 第五部分：最终文件结构
24. [起源版 SiPer 文件结构](#24-起源版-siper-文件结构)
25. [代码量变化](#25-代码量变化)
26. [验证清单](#26-验证清单)

---

# 第一部分：架构设计

---

## 1. 核心理念

### 1.1 一句话概括

```
前端页面 = f(后端快照)
```

后端维护前端页面状态的完整镜像（DOM 快照），前端只负责把快照渲染成 DOM。

### 1.2 两层存储

```
┌─────────────────────────────────────────────┐
│                后端进程                       │
│                                              │
│  ┌────────────────┐    ┌──────────────────┐  │
│  │  DOM 快照       │    │  数据库持久化     │  │
│  │  (内存)         │    │  (SQLite)         │  │
│  │                │    │                  │  │
│  │ • 当前页面状态  │ ←→ │ • 会话消息历史    │  │
│  │ • 会话列表顺序  │    │ • 模型配置       │  │
│  │ • 流式输出文本  │    │ • Token 用量     │  │
│  │ • 表单输入内容  │    │ • 技能统计       │  │
│  │ • 页面缓存数据  │    │ • 全局配置       │  │
│  └────────────────┘    └──────────────────┘  │
│                                              │
│  快照更新流程：                               │
│  1. 状态变化 → 更新内存快照                   │
│  2. 计算 delta → 推送给前端                   │
│  3. 关键变化 → 写入数据库                     │
└─────────────────────────────────────────────┘
```

### 1.3 前端按需调取

```
前端 → 后端请求 → 返回数据 → 渲染 DOM

首次加载：
  前端 → WS 连接 → 后端发 state_full（全量快照）
  → 前端 renderFull(snapshot) → 完整页面

运行时：
  后端状态变化 → WS 推送 state_delta
  → 前端 applyDelta(changes) → 精确更新 DOM

页面切换：
  前端 → WS 发 navigate(page)
  → 后端切换 current_page → 推送 state_full
  → 前端 renderFull() → 新页面

按需查询（HTTP）：
  前端 → GET /api/v1/sessions → 后端查 DB → 返回列表
  → 前端 renderSessionsList(data) → 渲染列表
```

### 1.4 设计原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **后端是状态权威** | 所有页面状态由后端计算和维护 |
| 2 | **前端是纯展示器** | 前端只做 DOM 更新，不做业务逻辑 |
| 3 | **通信是双通道** | WS 推实时数据，HTTP 拉按需数据 |
| 4 | **样式零改动** | CSS 和 HTML 结构完全保持不变 |
| 5 | **载体是适配器** | 不同载体只需实现 5 个回调函数 |

---

## 2. 架构全景

### 2.1 完整架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        载体层                                 │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Web UI   │ │ CLI      │ │ Desktop  │ │ Mobile   │        │
│  │ 浏览器   │ │ 终端     │ │ Tauri    │ │ Capacitor│        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │            │               │
│       └────────────┴─────┬──────┴────────────┘               │
│                          │                                    │
│                  ┌───────▼───────┐                            │
│                  │CarrierAdapter │ ← 5 个回调接口              │
│                  └───────┬───────┘                            │
├──────────────────────────┼───────────────────────────────────┤
│                    通信层                                      │
│  ┌───────────────────────┼──────────────────────────────┐    │
│  │  WS 通道              │  HTTP 通道                    │    │
│  │                       │                               │    │
│  │  state_full           │  GET  /api/v1/state/snapshot    │    │
│  │  state_delta          │  GET  /api/v1/sessions        │    │
│  │  stream_delta         │  GET  /api/v1/config          │    │
│  │  stream_end           │  POST /api/v1/agents/{name}   │    │
│  │  tool_progress        │  ...                          │    │
│  └───────────────────────┼──────────────────────────────┘    │
├──────────────────────────┼───────────────────────────────────┤
│                    状态管理层                                   │
│                  ┌───────▼───────┐                            │
│                  │ DOMSnapshot   │                            │
│                  │ Manager       │                            │
│                  └───────┬───────┘                            │
│                          │                                    │
│        ┌─────────────────┼─────────────────┐                  │
│        │                 │                 │                  │
│   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐             │
│   │ Session │      │  Agent  │      │  Model  │             │
│   │ Manager │      │ Config  │      │  Config │             │
│   └─────────┘      └─────────┘      └─────────┘             │
│                                                               │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐             │
│   │  Skill  │      │  Tool   │      │  Token  │             │
│   │ System  │      │ Registry│      │  Usage  │             │
│   └─────────┘      └─────────┘      └─────────┘             │
├──────────────────────────────────────────────────────────────┤
│                    持久化层                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │sessions.db│  │models.db │  │ token.db │  │ 文件配置 │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 版本演进

```
v0.6.7（当前）→ v1.0.0-origin（起源）

核心变化：
├── 新增：后端 DOMSnapshotManager
├── 新增：state_full / state_delta 推送协议
├── 重写：前端 core.js + renderer.js
├── 精简：删除 state.js，所有 pages/*.js 去业务逻辑
├── 重构：HTTP API 路由注册器
└── 新增：CarrierAdapter 多载体接口
```

---

## 3. 后端 DOM 快照管理器

### 3.1 快照数据结构（优化后）

```python
# 文件：ai_agent/state/dom_snapshot.py

@dataclassaclass
class SessionSummary:
    """会话摘要 — 列表页展示用（~200 字节）"""
    session_id: str           # 36 字节
    agent_name: str           # ~20 字节
    agent_icon: str           # ~10 字节
    last_message: str         # 截断到 80 字符
    last_time: str            # 19 字节
    message_count: int        # 8 字节
    unread: bool              # 1 字节
    title: str                # ~50 字节

@dataclassaclass
class MessageEntry:
    """消息条目 — 聊天展示用（~1KB）"""
    role: str                 # ~10 字节
    content: str              # 截断到 2000 字符
    timestamp: str            # 19 字节
    meta: dict or None        # 工具调用结果摘要（不含完整输出）

@dataclassaclass
class DOMSnapshot:
    """完整快照 — 常驻内存"""

    # ===== 层 1：常驻（固定大小 ~10KB）=====
    version: int = 0
    timestamp: str = ""
    current_page: str = "chat"
    sidebar_expanded: bool = True
    sidebar_search: str = ""
    active_session_id: str = None

    # 聊天状态
    is_streaming: bool = False
    stream_text: str = ""         # 流式文本（实时更新）
    stream_session_id: str = None
    is_thinking: bool = False
    thinking_text: str = ""       # 思考文本（实时更新）
    is_sending: bool = False
    input_text: str = ""

    # 全局 UI
    toasts: list = field(default_factory=list)   # 最多 5 条
    dialog: dict = None

    # ===== 层 2：活跃数据（LRU 淘汰 ~74KB）=====
    sessions: list = field(default_factory=list)  # 最多 50 条 SessionSummary
    messages: list = field(default_factory=list)   # 最多 50 条 MessageEntry
    agents: list = field(default_factory=list)     # 智能体列表
    expanded_agents: list = field(default_factory=list)
    thinking_steps: list = field(default_factory=list)  # 最多 20 步

    # ===== 层 3：页面缓存（TTL 淘汰）=====
    page_cache: dict = field(default_factory=dict)
    _cache_ts: dict = field(default_factory=dict)  # 缓存时间戳
    _cache_ttl: int = 30                            # 30 秒 TTL
    _cache_max_bytes: int = 200_000                 # 200KB 上限
    _cache_bytes: int = 0                           # 当前缓存大小
```

### 3.2 快照管理器实现

```python
# 文件：ai_agent/state/snapshot_manager.py

import asyncio
import copy
import json
import time
from typing import Any

class SnapshotManager:
    """DOM 快照管理器 — 单一数据源"""

    def __init__(self):
        self._snap = self._empty()
        self._version = 0
        self._lock = asyncio.Lock()
        self._deltas = []       # delta 历史（用于断线补发）
        self._max_deltas = 500
        self._clients = {}      # conn_id → CarrierAdapter
        self._pending = []
        self._batch_timer = None
        self._batch_ms = 50     # 50ms 批量窗口

    def _empty(self):
        return {
            "version": 0, "timestamp": "",
            "current_page": "chat", "sidebar_expanded": True, "sidebar_search": "",
            "sessions": [], "active_session_id": None,
            "chat_header_name": "", "messages": [],
            "is_streaming": False, "stream_text": "", "stream_session_id": None,
            "is_thinking": False, "thinking_text": "", "is_sending": False,
            "input_text": "", "thinking_steps": [],
            "agents": [], "expanded_agents": [],
            "page_cache": {}, "_cache_ts": {},
            "toasts": [], "dialog": None,
            "_cache_ttl": 30, "_cache_max_bytes": 200_000, "_cache_bytes": 0,
        }

    # ---- 快照操作 ----

    async def set(self, path: str, value: Any):
        """设置路径值，自动推送 delta"""
        async with self._lock:
            old = self._resolve(path)
            if old == value:
                return
            self._assign(path, value)
            self._bump()
            delta = {"op": "replace", "path": path, "value": value}
            self._record(delta)
            await self._enqueue(delta)

    async def batch_set(self, pairs: list):
        """批量设置 [(path, value), ...]"""
        async with self._lock:
            deltas = []
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

    async def insert(self, path: str, index: int, value: Any):
        async with self._lock:
            lst = self._resolve(path)
            lst.insert(index, value)
            self._bump()
            delta = {"op": "insert", "path": path, "index": index, "value": value}
            self._record(delta)
            await self._enqueue(delta)

    async def remove(self, path: str, index: int):
        async with self._lock:
            lst = self._resolve(path)
            lst.pop(index)
            self._bump()
            delta = {"op": "remove", "path": path, "index": index}
            self._record(delta)
            await self._enqueue(delta)

    async def move(self, path: str, from_idx: int, to_idx: int):
        async with self._lock:
            lst = self._resolve(path)
            lst.insert(to_idx, lst.pop(from_idx))
            self._bump()
            delta = {"op": "move", "path": path, "from": from_idx, "to": to_idx}
            self._record(delta)
            await self._enqueue(delta)

    # ---- 推送控制 ----

    async def _enqueue(self, delta):
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
            "changes": batch
        })

    # ---- 客户端管理 ----

    async def register(self, conn_id: str, adapter):
        """新连接 → 发全量快照"""
        self._clients[conn_id] = adapter
        await adapter.on_state_full(self.get_snapshot())

    async def register_resumed(self, conn_id: str, adapter, last_ver: int):
        """断线重连 → 补发缺失 deltas 或全量"""
        self._clients[conn_id] = adapter
        if last_ver <= 0 or last_ver >= self._version:
            await adapter.on_state_full(self.get_snapshot())
            return
        missing = self._deltas[last_ver:]
        if missing and len(missing) < 100:
            await adapter.on_state_deltas(last_ver, self._version, missing)
        else:
            await adapter.on_state_full(self.get_snapshot())

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

    # ---- 快照大小控制 ----

    MAX_SNAPSHOT_BYTES = 500_000  # 500KB 上限

    async def _check_size(self):
        size = self._estimate_size()
        if size > self.MAX_SNAPSHOT_BYTES:
            await self._evict()

    async def _evict(self):
        """淘汰策略：先清 page_cache，再截断 messages"""
        snap = self._snap
        # 1. 清空页面缓存
        snap["page_cache"].clear()
        snap["_cache_ts"].clear()
        snap["_cache_bytes"] = 0
        # 2. 截断消息列表
        if len(snap["messages"]) > 20:
            snap["messages"] = snap["messages"][-20:]
        # 3. 截断会话列表
        if len(snap["sessions"]) > 30:
            snap["sessions"] = snap["sessions"][:30]

    def _estimate_size(self) -> int:
        return len(json.dumps(self._snap, ensure_ascii=False, default=str))

    # ---- 工具方法 ----

    def get_snapshot(self) -> dict:
        return copy.deepcopy(self._snap)

    def _bump(self):
        self._version += 1
        self._snap["version"] = self._version
        self._snap["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    def _record(self, delta):
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

---

## 4. 推送协议 v2

### 4.1 消息类型定义

```python
# 文件：ai_agent/state/protocol.py

# === 后端 → 前端 ===

# 全量快照（首次连接 / 重连）
# {"type": "state_full", "version": N, "data": {...完整快照...}}

# 增量更新（运行时）
# {"type": "state_delta", "version": N, "changes": [{op, path, value}, ...]}

# 增量补发（断线重连）
# {"type": "state_deltas", "from_version": M, "to_version": N, "changes": [...]}

# 流式增量（实时打字）
# {"type": "stream_delta", "delta": "文本", "session_id": "xxx"}

# 流式完成
# {"type": "stream_end", "session_id": "xxx", "data": {response, tool_calls, usage, ...}}

# 工具进度
# {"type": "tool_progress", "tool_name": "xxx", "status": "running|done|error", "info": {...}, "call_id": "xxx"}

# 通知
# {"type": "toast", "data": {type: "success|error|info", "message": "...", "duration": 3000}}

# 弹窗
# {"type": "dialog", "data": {type: "confirm|input|form", "title": "...", ...}}

# === 前端 → 后端 ===

# 用户消息
# {"type": "message", "content": "...", "session_id": "xxx", "agent": "default", "model": "xxx", "images": [...]}

# 停止生成
# {"type": "stop"}

# 创建新会话
# {"type": "new_session", "agent": "default"}

# 切换会话
# {"type": "switch_session", "session_id": "xxx"}

# 页面导航
# {"type": "navigate", "page": "sessions"}

# 澄清回答
# {"type": "clarify_response", "session_id": "xxx", "answer": "..."}

# 心跳
# {"type": "ping"}
```

### 4.2 Delta 操作类型

| op | 参数 | 说明 | 前端处理 |
|----|------|------|---------|
| replace | path, value | 替换值 | `el.textContent = value` |
| insert | path, index, value | 插入列表项 | `list.insertAdjacentHTML(...)` |
| remove | path, index, 删除列表项 | `el.remove()` |
| move | path, from, to | 移动列表项 | `insertBefore(...)` |

### 4.3 推送时机矩阵

| 状态变化 | 推送 | 内容 |
|----------|------|------|
| 新会话创建 | state_delta | insert sessions[0] |
| 会话消息更新 | state_delta | replace sessions[N].last_message |
| 会话顺序变化 | state_delta | move sessions |
| 流式输出 | stream_delta | delta text（不批量） |
| 流式完成 | stream_end | full response |
| 工具调用 | tool_progress | status update |
| 配置变更 | state_delta | replace config.path |
| 页面切换 | state_full | 完整快照 |
| WS 重连(有版本) | state_deltas | 缺失的 deltas |
| WS 重连(无版本) | state_full | 完整快照 |

---

# 第二部分：内存优化

---

## 5. 当前内存热点分析

### 5.1 当前代码的内存泄漏点

| # | 位置 | 问题 | 影响 |
|---|------|------|------|
| 1 | `dom.js:181` | 每个 stream_delta 都 `renderMarkdown(_streamAcc)` 重建整个气泡 DOM | 长对话中重复创建 DOM 树 |
| 2 | `dom.js:299` | `tokenHistory.push(...)` 无限增长数组 | 长时间运行后内存膨胀 |
| 3 | `dom.js:150` | `_tool_call_steps = []` 只在 stream_end 清空 | 大量工具调用时堆积 |
| 4 | `dom.js:145` | `_streamAcc` 累加字符串不截断 | 长回复中字符串持续增长 |
| 5 | `dom.js:203` | `fetch('/api/save-response-dict')` 发送完整 response_dict | 网络传输冗余数据 |
| 6 | `dom.js:42` | `dynamicPage.innerHTML = ''` 清空页面但旧 DOM 引用未释放 | 页面切换时内存残留 |
| 7 | `siper_web.py` | `agent.conversation_history[sid]` 无限增长 | 后端会话历史无上限 |
| 8 | `siper_web.py` | `_SESSION_LIST_LIMIT` 只限制 DB 查询，不限制内存 | 会话列表内存无限增长 |
| 9 | 前端每次 fetch 返回完整 JSON | HTTP 响应数据全量加载到内存 | 大响应体占用内存 |

### 5.2 内存增长曲线

```
当前架构：
运行时间 ──────────────────────────────────────────→
内存     ╱
        ╱
       ╱        ← 线性增长，不可逆
      ╱
     ╱
    ╱───
   ╱
  ╱
 ╱

起源架构：
运行时间 ──────────────────────────────────────────→
内存  ──────┐
            │  ← 固定上限，可控
            └─────────────────────────────────────
```

---

## 6. 四层存储策略

```
┌──────────────────────────────────────────────────────────┐
│ 层 1：常驻内存（固定大小）                                  │
│                                                          │
│  • current_page: str (几十字节)                           │
│  • active_session_id: str (36 字节 UUID)                  │
│  • sidebar_expanded: bool                                 │
│  • sidebar_search: str                                    │
│  • is_streaming / is_sending / is_thinking: bool          │
│  • stream_text: str (当前流式文本，最多几 KB)              │
│  • thinking_text: str (当前思考文本，最多几 KB)            │
│  • input_text: str (输入框内容)                           │
│  • toasts: list (最多 5 条，每条 200 字节)                │
│  • dialog: dict or None                                   │
│                                                          │
│  固定开销：~10KB                                          │
├──────────────────────────────────────────────────────────┤
│ 层 2：活跃数据（LRU 淘汰）                                  │
│                                                          │
│  • sessions: list (最多 50 条摘要)                         │
│    每条 ~200 字节，总计 ~10KB                             │
│  • messages: list (当前会话，最多 50 条)                   │
│    每条 ~1KB，总计 ~50KB                                  │
│  • agents: list (智能体列表，通常 <20 条)                  │
│    每条 ~500 字节，总计 ~10KB                             │
│  • thinking_steps: list (当前思考步骤，最多 20 步)         │
│    每条 ~200 字节，总计 ~4KB                              │
│                                                          │
│  活跃开销：~74KB                                          │
├──────────────────────────────────────────────────────────┤
│ 层 3：页面缓存（按需加载，TTL 淘汰）                        │
│                                                          │
│  • page_cache: dict                                      │
│    只在用户切换到该页面时加载                              │
│    离开页面后保留缓存，但有 TTL（30 秒）                   │
│    超过 TTL 或内存压力时自动释放                          │
│                                                          │
│  缓存策略：                                               │
│  • 每个页面缓存最多 30 秒                                  │
│  • 总缓存上限 200KB                                       │
│  • LRU 淘汰最久未访问的页面缓存                            │
├──────────────────────────────────────────────────────────┤
│ 层 4：数据库持久化（磁盘）                                  │
│                                                          │
│  • sessions.db: 全量会话消息历史                           │
│  • models.db: 模型配置                                    │
│  • token.db: Token 用量记录                               │
│                                                          │
│  按需查询，不预加载                                        │
└──────────────────────────────────────────────────────────┘
```

---

## 7. 每个字段的详细构建方式

### 7.1 会话列表（sessions）

**数据来源**：SQLite `sessions` 表 + 内存 `active_sessions`

**构建时机**：
- 服务启动时：从 DB 加载最近 50 条
- 新会话创建时：插入列表头部
- 会话消息更新时：更新对应条目的 `last_message` / `message_count`
- 会话删除时：从列表移除

**构建方式**：
```python
# 后端：只加载摘要字段，不加载完整消息
def build_sessions_list():
    sessions = []
    for row in db_query(limit=50):
        sessions.append(SessionSummary(
            session_id=row["session_id"],
            agent_name=row["agent_name"],
            agent_icon=AGENT_ICONS.get(row["agent_name"], "🎭"),
            last_message=row["last_content"][:80],  # 截断到 80 字符
            last_time=row["last_ts"],
            message_count=row["msg_count"],
            unread=False,
            title=row["title"][:50],
        ))
    return sessions
```

**前端渲染**：
```javascript
// 只渲染可见行 + 缓冲行（虚拟列表）
function renderSessions(list) {
    const el = document.getElementById('sessionsList');
    if (!el) return;
    const visible = list.slice(0, 20);
    el.innerHTML = visible.map(s => `
        <div class="session-item ${s.unread ? 'unread' : ''}" data-sid="${s.session_id}">
            <span class="agent-icon">${s.agent_icon}</span>
            <span class="session-last-msg">${esc(s.last_message)}</span>
            <span class="session-time">${s.last_time}</span>
        </div>`).join('');
}
```

**内存控制**：
- 后端快照中 `sessions` 最多 50 条
- 前端只渲染可见的 20 条
- 滚动时按需渲染（虚拟列表）

### 7.2 消息列表（messages）

**构建方式**：
```python
# 后端：只保留最近 50 条在快照中
MAX_SNAPSHOT_MESSAGES = 50

def build_messages(session_id):
    if session_id in agent.conversation_history:
        msgs = agent.conversation_history[session_id]
    else:
        msgs = db_load_messages(session_id, limit=MAX_SNAPSHOT_MESSAGES)

    entries = []
    for m in msgs[-MAX_SNAPSHOT_MESSAGES:]:
        entries.append(MessageEntry(
            role=m.get("role", "unknown"),
            content=truncate(m.get("content", ""), 2000),  # 截断到 2000 字符
            timestamp=m.get("timestamp", ""),
            meta=extract_meta_summary(m),  # 只保留摘要，不含完整工具输出
        ))
    return entries

def extract_meta_summary(msg):
    """从消息中提取元数据摘要（不含完整工具输出）"""
    meta = msg.get("meta") or {}
    if not meta:
        return None
    return {
        "tools_used": [
            {"name": t.get("tool_name"), "status": t.get("status")}
            for t in meta.get("tool_calls_executed", [])
        ],
        "token_usage": meta.get("token_usage"),
    }
```

**前端渲染**：
```javascript
const MAX_VISIBLE_MESSAGES = 30;

function renderMessages(msgs) {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    const visible = msgs.slice(-MAX_VISIBLE_MESSAGES);
    el.innerHTML = visible.map(m => `
        <div class="msg-row ${m.role}">
            <div class="bubble">${renderMarkdown(m.content)}</div>
            ${m.meta ? renderToolSummary(m.meta.tools_used) : ''}
        </div>`).join('');
}
```

**内存控制**：
- 后端快照中 `messages` 最多 50 条
- 前端 DOM 中最多 30 条
- 工具调用完整输出存 DB，不在快照中

### 7.3 流式文本（stream_text）

**构建方式**：
```python
# 后端：实时更新，不累积历史
async def on_stream_delta(delta: str, session_id: str):
    await snapshot_mgr.set("stream_text", delta)
    await broadcast({"type": "stream_delta", "delta": delta, "session_id": session_id})
```

**前端处理**：
```javascript
let _streamTextEl = null;

function appendStream(delta, sid) {
    if (!_streamTextEl) {
        const row = document.createElement('div');
        row.className = 'siper-msg-row agent siper-stream-row';
        // ... 创建 DOM 结构
        _streamTextEl = row.querySelector('.siper-stream-text');
        document.getElementById('chatMessages').appendChild(row);
    }
    _streamTextEl.textContent += delta;  // 追加文本节点，不重建
}
```

**内存控制**：
- 流式文本在 `stream_end` 后清空
- 后端快照中 `stream_text` 只在流式期间存在

### 7.4 思考过程（thinking_text + thinking_steps）

**内存控制**：
- `thinking_text` 截断到 2000 字符
- `thinking_steps` 最多 20 步
- 思考完成后清空

### 7.5 页面缓存（page_cache）

**构建方式**：
```python
def get_page_cache(page: str) -> dict:
    cache = snapshot_mgr.get_snapshot()["page_cache"]
    ts = snapshot_mgr.get_snapshot()["_cache_ts"]

    if page in cache and time.time() - ts.get(page, 0) > 30:
        del cache[page]
        del ts[page]

    if page not in cache:
        cache[page] = build_page_data(page)
        ts[page] = time.time()

    return cache[page]

def build_page_data(page: str) -> dict:
    """按需构建页面数据"""
    builders = {
        "sessions": lambda: {"list": build_sessions_list()},
        "memory": lambda: {"md_content": load_memory_md()[:5000], "config": load_memory_config()},
        "agent_config": lambda: build_agent_config(),
        "monitor": lambda: build_monitor_data(),
        "skills": lambda: {"list": build_skills_list()},
        "token": lambda: build_token_stats(),
        "settings": lambda: build_settings(),
        "theme": lambda: build_theme(),
        "model_settings": lambda: build_model_settings(),
        "logs": lambda: build_logs(page=1, limit=50),
    }
    return builders.get(page, lambda: {})()
```

**TTL 淘汰**：
```python
async def cache_cleanup():
    while True:
        await asyncio.sleep(10)
        snap = snapshot_mgr.get_snapshot()
        now = time.time()
        expired = [p for p, ts in snap["_cache_ts"].items() if now - ts > snap["_cache_ttl"]]
        for p in expired:
            size = estimate_size(snap["page_cache"][p])
            del snap["page_cache"][p]
            del snap["_cache_ts"][p]
            snap["_cache_bytes"] -= size
```

### 7.6 全局 UI（toasts + dialog）

**内存控制**：
- toasts 最多 5 条，显示后自动从 DOM 移除（3 秒后 `el.remove()`）
- dialog 只有一个 DOM 元素，复用，不新建

---

## 8. 前端内存优化

### 8.1 DOM 虚拟化（长列表）

```javascript
class VirtualList {
    constructor(container, itemHeight, renderItem) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.data = [];
        this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 4;
        this.startIndex = 0;
        container.addEventListener('scroll', () => this.onScroll());
    }

    setData(data) {
        this.data = data;
        this.container.style.height = `${data.length * this.itemHeight}px`;
        this.render();
    }

    onScroll() {
        const scrollTop = this.container.scrollTop;
        const newStart = Math.max(0, Math.floor(scrollTop / this.itemHeight) - 2);
        if (newStart !== this.startIndex) { this.startIndex = newStart; this.render(); }
    }

    render() {
        const end = Math.min(this.startIndex + this.visibleCount, this.data.length);
        const visible = this.data.slice(this.startIndex, end);
        this.container.innerHTML = visible.map((item, i) =>
            this.renderItem(item, this.startIndex + i)
        ).join('');
    }
}
```

**适用场景**：会话列表（几百条→20）、日志列表（几千条→30）

### 8.2 流式渲染节流

```javascript
let _streamAcc = '';
let _streamRenderTimer = null;
let _streamTextEl = null;

function appendStream(delta, sid) {
    if (!_streamTextEl) { /* 首次创建 DOM */ }
    _streamTextEl.textContent += delta;
    _streamAcc += delta;

    // 节流 Markdown 渲染：每 200ms 最多一次
    if (!_streamRenderTimer) {
        _streamRenderTimer = setTimeout(() => {
            const bubble = _streamTextEl.closest('.siper-bubble');
            if (bubble) { bubble.innerHTML = ''; bubble.appendChild(renderMarkdown(_streamAcc)); }
            _streamRenderTimer = null;
        }, 200);
    }
}
```

**效果**：避免每次 delta 重建 DOM 树，减少 80% DOM 操作

### 8.3 数据截断策略

| 字段 | 截断长度 | 说明 |
|------|---------|------|
| `sessions[].last_message` | 80 字符 | 列表预览 |
| `messages[].content` | 2000 字符 | 聊天展示 |
| `thinking_text` | 2000 字符 | 思考过程 |
| `thinking_steps` | 20 步 | 最近思考步骤 |
| `toasts[].message` | 200 字符 | 通知文本 |
| `dialog.title` | 100 字符 | 弹窗标题 |
| `dialog.content` | 500 字符 | 弹窗内容 |
| `page_cache.memory.md_content` | 5000 字符 | 记忆预览 |
| `page_cache.logs` | 50 条 | 只缓存第 1 页 |

### 8.4 页面切换清理

```javascript
function switchPage(newPage) {
    const dynamicPage = document.getElementById('page-dynamic');
    if (dynamicPage) dynamicPage.innerHTML = '';  // 彻底清理旧 DOM
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';
    _streamAcc = '';
    _streamTextEl = null;
    _toolCallSteps = [];
}
```

---

## 9. 后端内存优化

### 9.1 会话历史截断

```python
MAX_CONVERSATION_HISTORY = 50

def add_message(session_id, message):
    history = agent.conversation_history[session_id]
    history.append(message)
    if len(history) > MAX_CONVERSATION_HISTORY:
        system = [m for m in history if m.get("role") == "system"]
        recent = history[-(MAX_CONVERSATION_HISTORY - len(system)):]
        agent.conversation_history[session_id] = system + recent
```

### 9.2 数据库连接池

```python
class DatabaseManager:
    def __init__(self, root: Path):
        self._root = root
        self._conns = {}

    def conn(self, name: str) -> sqlite3.Connection:
        if name not in self._conns:
            path = self._path(name)
            c = sqlite3.connect(str(path), check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA cache_size=-8000")  # 8MB 缓存
            c.row_factory = sqlite3.Row
            self._conns[name] = c
        return self._conns[name]

    def close_idle(self):
        for name, conn in list(self._conns.items()):
            try: conn.close()
            except Exception: pass
        self._conns.clear()
```

---

## 10. 内存监控

### 10.1 后端监控

```python
import tracemalloc

def get_memory_stats(self) -> dict:
    current, peak = tracemalloc.get_traced_memory()
    return {
        "snapshot_bytes": self._estimate_size(),
        "snapshot_version": self._version,
        "connected_clients": len(self._clients),
        "page_cache_pages": len(self._snap["page_cache"]),
        "page_cache_bytes": self._snap["_cache_bytes"],
        "python_current_mb": current / 1024 / 1024,
        "python_peak_mb": peak / 1024 / 1024,
    }
```

### 10.2 前端监控

```javascript
if (performance.memory) {
    setInterval(() => {
        const mem = performance.memory;
        const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
        const totalMB = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
        console.log(`[Memory] ${usedMB}MB / ${totalMB}MB`);
    }, 30000);
}
```

---

## 11. 内存预算

| 组件 | 最大内存 | 淘汰策略 |
|------|---------|---------|
| 常驻状态 | ~10KB | 固定大小，不增长 |
| 活跃数据（sessions + messages + agents） | ~74KB | LRU 截断 |
| 页面缓存 | ~200KB | TTL 30s + LRU |
| 流式文本 | ~4KB | stream_end 后清空 |
| toasts | ~1KB | 最多 5 条，自动消失 |
| dialog | ~0.5KB | 最多 1 个 |
| 前端 DOM（虚拟列表） | ~100KB | 只渲染可见行 |
| **总计** | **~390KB** | **可控** |

---

# 第三部分：功能实现

---

## 12. 前端架构

### 12.1 核心原则

```
CSS 零改动 | HTML 零改动 | 只改 JS
```

### 12.2 前端文件结构（新）

```
webui/js/
├── app.js            # 入口（~15行）
├── core.js           # WS + 消息分发（~60行）
├── renderer.js       # 统一渲染（~200行）
├── api.js            # HTTP 请求（保留，43行）
├── utils/
│   ├── escape.js     # escapeHtml（保留，6行）
│   ├── i18n.js       # 国际化（保留，1398行）
│   └── capabilities.js # 能力检测（保留，41行）
├── components/
│   ├── toast.js      # 通知（保留，~660行）
│   ├── model-test.js # 模型测试（保留，207行）
│   └── agent-models.js # 智能体模型（保留，107行）
├── chat/
│   ├── message.js    # 消息渲染（精简，~150行）
│   ├── input.js      # 输入框（精简，~200行）
│   ├── sidebar.js    # 侧边栏（精简，~200行）
│   └── lang.js       # 语言（保留，48行）
└── pages/
    ├── sessions.js   # 会话管理（精简，~60行）
    ├── memory.js     # 记忆管理（精简，~50行）
    ├── agent-config.js # 智能体配置（精简，~200行）
    ├── settings.js   # 全局设置（精简，~80行）
    ├── model-settings.js # 模型管理（精简，~250行）
    ├── theme.js      # 主题设置（精简，~100行）
    ├── skills.js     # 技能管理（精简，~40行）
    ├── token.js      # Token 用量（精简，~100行）
    └── logs.js       # 日志（精简，~60行）
```

### 12.3 core.js

```javascript
// core.js — 前端核心（~60行）

import { renderFull, applyDelta, appendStream, finalizeStream, updateToolCard } from './renderer.js';

let ws = null;
let ver = 0;

export function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.hostname}:${parseInt(location.port) + 1}`);
    ws.onmessage = e => dispatch(JSON.parse(e.data));
    ws.onclose = () => setTimeout(connectWS, 3000);
}

function dispatch(msg) {
    switch (msg.type) {
        case 'state_full':      ver = msg.version; renderFull(msg.data); break;
        case 'state_delta':     ver = msg.version; applyDelta(msg.changes); break;
        case 'state_deltas':    ver = msg.to_version; applyDelta(msg.changes); break;
        case 'stream_delta':    appendStream(msg.delta, msg.session_id); break;
        case 'stream_end':      finalizeStream(msg.data); break;
        case 'tool_progress':   updateToolCard(msg); break;
        case 'toast':           showToast(msg.data); break;
        case 'dialog':          showDialog(msg.data); break;
    }
}

export const send = (obj) => ws?.send(JSON.stringify(obj));
export const nav = (page) => send({type: 'navigate', page});
```

### 12.4 renderer.js

```javascript
// renderer.js — 统一渲染（~200行）

const handlers = {
    current_page:          v => v === 'chat' ? showChat() : showPage(v),
    sidebar_expanded:     v => document.getElementById('chatSidebar').classList.toggle('collapsed', !v),
    sidebar_search:        v => { const el = document.getElementById('chatSearchInput'); if (el) el.value = v; },
    active_session_id:     v => highlightSession(v),
    chat_header_name:      v => { const el = document.getElementById('chatRightHeaderName'); if (el) el.textContent = v; },
    is_streaming:          v => { document.getElementById('chatSendBtn').disabled = v; },
    stream_text:           v => { const el = document.querySelector('.siper-stream-text'); if (el) el.textContent = v; },
    is_thinking:           v => v ? showThinking() : hideThinking(),
    thinking_text:         v => updateThinkingText(v),
    is_sending:            v => { document.getElementById('chatSendBtn').disabled = v; },
    'sessions':            v => renderSessions(v),
    'messages':            v => renderMessages(v),
    'agents':              v => renderAgents(v),
};

function renderFull(s) {
    handlers.current_page(s.current_page);
    handlers.sidebar_expanded(s.sidebar_expanded);
    handlers.sidebar_search(s.sidebar_search);
    if (s.current_page === 'chat') {
        handlers.chat_header_name(s.chat_header_name);
        handlers.agents(s.agents);
        renderMessages(s.messages);
        handlers.is_streaming(s.is_streaming);
        handlers.stream_text(s.stream_text);
        handlers.is_thinking(s.is_thinking);
        handlers.thinking_text(s.thinking_text);
        handlers.is_sending(s.is_sending);
        highlightSession(s.active_session_id);
    } else {
        renderPageContent(s.current_page, s.page_cache);
    }
}

function applyDelta(changes) {
    for (const c of changes) {
        if (c.op === 'replace') {
            if (handlers[c.path]) { handlers[c.path](c.value); continue; }
            const prefix = c.path.replace(/\[\d+\].*/, '');
            if (handlers[prefix]) { handlers[prefix](c.value); continue; }
            if (c.path.startsWith('page_cache.')) { updatePageCache(c.path.slice(11), c.value); }
        }
    }
}

export function appendStream(delta, sid) { /* 流式追加（见内存优化部分） */ }
export function finalizeStream(data) { /* 流式完成 */ }
export function updateToolCard(msg) { /* 工具进度 */ }
```

### 12.5 app.js（最终版）

```javascript
// app.js — 入口（~15行）
import { connectWS } from './core.js';
connectWS();
```

---

## 13. HTTP API 重构

### 13.1 路由注册器

```python
# 文件：ai_agent/api/router.py

class Router:
    def __init__(self, prefix="/api/v1"):
        self.prefix = prefix
        self._routes = []

    def get(self, path):
        def deco(fn): self._routes.append(('GET', self.prefix + path, fn)); return fn
        return deco

    def post(self, path):
        def deco(fn): self._routes.append(('POST', self.prefix + path, fn)); return fn
        return deco

    def put(self, path):
        def deco(fn): self._routes.append(('PUT', self.prefix + path, fn)); return fn
        return deco

    def delete(self, path):
        def deco(fn): self._routes.append(('DELETE', self.prefix + path, fn)); return fn
        return deco

    def dispatch(self, method, path):
        for m, p, fn in self._routes:
            if m == method and p == path:
                return fn
        return None

router = Router()

@router.get("/sessions")
async def list_sessions(request):
    return ok(await get_sessions())

@router.get("/state/snapshot")
async def get_snapshot(request):
    return ok(snapshot_mgr.get_snapshot())

def ok(data):
    return {"code": 0, "data": data, "message": "ok"}
```

### 13.2 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/state/snapshot | 获取全量 DOM 快照 |
| GET | /api/v1/state/version | 获取快照版本号 |
| POST | /api/v1/message | 发消息（WS 备用） |

### 13.3 统一响应格式

```json
// 成功
{"code": 0, "data": {...}, "message": "ok"}

// 错误
{"code": 40001, "data": null, "message": "Session not found"}
```

---

## 14. 多载体适配

### 14.1 CarrierAdapter 接口

```python
# 文件：ai_agent/state/carrier.py

class CarrierAdapter:
    async def on_state_full(self, state: dict): raise NotImplementedError
    async def on_state_deltas(self, from_ver: int, to_ver: int, changes: list): raise NotImplementedError
    async def on_stream_delta(self, delta: str, session_id: str): raise NotImplementedError
    async def on_stream_end(self, data: dict): raise NotImplementedError
    async def on_tool_progress(self, tool: dict): raise NotImplementedError
    async def _send(self, msg: dict): raise NotImplementedError

class WebUIAdapter(CarrierAdapter):
    def __init__(self, ws): self.ws = ws
    async def _send(self, msg): await self.ws.send(json.dumps(msg, ensure_ascii=False, default=str))
    async def on_state_full(self, state): await self._send({"type": "state_full", "version": state["version"], "data": state})
    async def on_state_deltas(self, from_ver, to_ver, changes): await self._send({"type": "state_deltas", "from_version": from_ver, "to_version": to_ver, "changes": changes})
    async def on_stream_delta(self, delta, sid): await self._send({"type": "stream_delta", "delta": delta, "session_id": sid})
    async def on_stream_end(self, data): await self._send({"type": "stream_end", "data": data})
    async def on_tool_progress(self, tool): await self._send({"type": "tool_progress", **tool})

class CLIAdapter(CarrierAdapter):
    async def on_state_full(self, state): print(f"[CLI] Session: {state.get('active_session_id')}")
    async def on_stream_delta(self, delta, sid): print(delta, end='', flush=True)
    async def on_stream_end(self, data): print()
    async def on_tool_progress(self, tool): print(f"  {'⏳' if tool['status'] == 'running' else '✅'} {tool['tool_name']}")

class APIAdapter(CarrierAdapter):
    def __init__(self): self._snapshot = {}
    async def on_state_full(self, state): self._snapshot = state
    async def on_state_deltas(self, from_ver, to_ver, changes):
        for c in changes:
            if c['op'] == 'replace': self._apply(c['path'], c['value'])
    def get_snapshot(self): return self._snapshot
```

---

## 15. 跨平台策略

| 载体 | 技术 | 包体积 | 说明 |
|------|------|--------|------|
| Web UI | 浏览器 | 0 | 当前方案 |
| Windows/macOS/Linux | Tauri | ~5MB | Rust 壳 + Web UI |
| Android/iOS | Capacitor | ~10MB | WebView + Native |
| PWA | Service Worker | 0 | 浏览器安装 |

---

## 16. 代码去重与简化

### 16.1 前端去重

| 问题 | 当前 | 新方案 |
|------|------|--------|
| fetch + 渲染 | 22 处 fetch，每页重复 | WS 推送 + renderer.js |
| loading 状态 | 每页 innerHTML='加载中...' | 统一 Loading 组件 |
| 表单自动保存 | 每 input oninput=triggerAutoSave | data-bind 声明式绑定 |
| Tab 切换 | 每页重复 tab 逻辑 | 统一 Tab 组件 |

### 16.2 后端去重

| 问题 | 当前 | 新方案 |
|------|------|--------|
| API 路由 | 50+ if/elif | Router 装饰器注册 |
| 数据库 CRUD | 每模型重复 | Repository 基类 |
| WS 消息发送 | 多处 ws.send(json.dumps(...)) | adapter._send(msg) |

---

## 17. 数据存储重构

```python
# 文件：ai_agent/db/manager.py

class DatabaseManager:
    def __init__(self, root: Path):
        self._root = root
        self._conns = {}

    def conn(self, name: str) -> sqlite3.Connection:
        if name not in self._conns:
            path = self._path(name)
            c = sqlite3.connect(str(path), check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA cache_size=-8000")
            c.row_factory = sqlite3.Row
            self._conns[name] = c
        return self._conns[name]

    def _path(self, name: str) -> Path:
        return {
            "sessions": self._root / "agents" / "default" / "sessions" / "sessions.db",
            "models":   self._root / "models.db",
            "token":    self._root / "agents" / "token.db",
        }[name]
```

---

# 第四部分：开发步骤

---

## 18. Phase 0：基础设施

### Step 0.1：创建项目结构

新建目录和文件骨架：

```
新建：
├── ai_agent/state/
│   ├── __init__.py
│   ├── dom_snapshot.py       # 快照数据结构
│   ├── snapshot_manager.py   # 快照管理器
│   ├── protocol.py           # 推送协议定义
│   └── carrier.py            # 载体适配器
├── ai_agent/api/
│   ├── __init__.py
│   ├── router.py             # HTTP 路由注册器
│   └── handlers.py           # API 处理函数（从 siper_web.py 迁移）
├── ai_agent/db/
│   ├── __init__.py
│   └── manager.py            # 数据库管理器
```

**验证**：`python -c "from ai_agent.state.snapshot_manager import SnapshotManager"` 无报错

### Step 0.2：实现 DOM 快照数据结构

**文件**：`ai_agent/state/dom_snapshot.py`（~50 行）

**验证**：
```python
from ai_agent.state.dom_snapshot import DOMSnapshot
s = DOMSnapshot()
assert s.current_page == "chat"
```

### Step 0.3：实现 SnapshotManager

**文件**：`ai_agent/state/snapshot_manager.py`（~150 行）

**验证**：
```python
import asyncio
from ai_agent.state.snapshot_manager import SnapshotManager
async def test():
    mgr = SnapshotManager()
    await mgr.set("current_page", "sessions")
    assert mgr.get_snapshot()["current_page"] == "sessions"
    assert mgr._version == 1
asyncio.run(test())
```

### Step 0.4：实现推送协议

**文件**：`ai_agent/state/protocol.py`（~80 行）

### Step 0.5：实现载体适配器

**文件**：`ai_agent/state/carrier.py`（~120 行）

### Step 0.6：实现 HTTP 路由注册器

**文件**：`ai_agent/api/router.py`（~50 行）

### Step 0.7：实现数据库管理器

**文件**：`ai_agent/db/manager.py`（~30 行）

### Step 0.8：集成到 siper_web.py

**文件**：`siper_web.py`

**改动**：
1. 添加 import SnapshotManager
2. 在 `main()` 中初始化
3. 在 `ws_handler` 开头注册连接
4. 在 `ws_handler` 结尾注销连接
5. 添加 `/api/v1/state/snapshot` 端点

**改动量**：约 20 行

**验证**：启动服务 → `curl http://localhost:9724/api/v1/state/snapshot` 返回 JSON

---

## 19. Phase 1：聊天核心迁移

### Step 1.1：创建 core.js

**文件**：`webui/js/core.js`（~60 行）

### Step 1.2：创建 renderer.js

**文件**：`webui/js/renderer.js`（~200 行）

### Step 1.3：重写 app.js

**文件**：`webui/js/app.js`（235 行 → 15 行）

### Step 1.4：验证前端骨架

启动服务 → 打开浏览器 → 确认无 JS 错误 → 确认 WS 连接成功

### Step 1.5：后端消息处理集成快照

**文件**：`siper_web.py`

在 `_process_ws_message` 中集成：
- 消息处理开始：`await snapshot_mgr.set("is_sending", True)`
- 流式 delta：`await snapshot_mgr.set("stream_text", accumulator)`
- 流式完成：`await snapshot_mgr.batch_set([("is_streaming", False), ("messages", updated)])`

### Step 1.6：后端会话列表计算

**文件**：新增 `ai_agent/state/session_sync.py`（~80 行）

### Step 1.7：前端聊天模块精简

| 文件 | 当前行数 | 目标行数 | 主要改动 |
|------|---------|---------|---------|
| chat/message.js | 364 | 150 | 删除 fetch，保留纯渲染 |
| chat/input.js | 430 | 200 | send → WS |
| chat/sidebar.js | 657 | 200 | 删除 fetch，保留 UI 交互 |
| chat/stream.js | 376 | 0 | 删除（移到 renderer.js） |
| chat/state.js | 220 | 0 | 删除（由后端管理） |

### Step 1.8：验证聊天核心

发送消息 → 流式输出 → AI 回复 → 工具调用卡片 → 切换会话 → 刷新恢复

---

## 20. Phase 2：独立页面迁移

### Step 2.1：前端页面导航改造

**文件**：`webui/js/utils/dom.js`（1008 行 → 100 行）

删除所有 tplMap / cloneNode / initRouter / refreshXxx，只保留 escapeHtml / toast 等纯工具函数。

### Step 2.2-2.11：各页面精简

| 文件 | 当前行数 | 目标行数 | 主要改动 |
|------|---------|---------|---------|
| pages/sessions.js | 323 | 60 | 删除 fetch，纯渲染 |
| pages/memory.js | 158 | 50 | 删除 fetch，纯渲染 |
| pages/agent-config.js | 770 | 200 | 删除 22 处 fetch，保留 UI 交互 |
| pages/settings.js | 377 | 80 | 删除 7 处 fetch |
| pages/model-settings.js | 1032 | 250 | 删除 6 处 fetch，保留搜索/排序 |
| pages/theme.js | 283 | 100 | 删除 fetch，保留颜色选择器 |
| pages/skills.js | 90 | 40 | 删除 2 处 fetch |
| pages/token.js | 355 | 100 | 删除 fetch，保留图表 |
| pages/logs.js | 198 | 60 | 删除 fetch，保留筛选/分页 |
| components/toast.js | 655 | 660 | 微增（添加 showToast 入口） |

---

## 21. Phase 3：API 重构 + 去重

### Step 3.1：迁移 HTTP API 到 Router

**文件**：`siper_web.py`（-300 行） + `ai_agent/api/handlers.py`（+400 行）

### Step 3.2：添加状态同步函数

**文件**：`ai_agent/state/session_sync.py`（~150 行）

### Step 3.3：集成所有状态同步

**文件**：`siper_web.py`

---

## 22. Phase 4：清理与优化

### Step 4.1：删除废弃文件

```
删除：
├── webui/js/chat/state.js
├── webui/js/chat/stream.js
└── webui/js/utils/dom.js（由 core.js + renderer.js 替代）
```

### Step 4.2：清理 app.js 残留

最终只保留：`import { connectWS } from './core.js'; connectWS();`

---

## 23. Phase 5：多载体 + 跨平台

### Step 5.1：CarrierManager

### Step 5.2：Tauri 桌面端

### Step 5.3：Capacitor 移动端（可选）

---

# 第五部分：最终文件结构与代码量

---

## 24. 起源版 SiPer 文件结构

### 24.1 完整目录树

```
siper/                              # 项目根目录
│
├── siper_web.py                   # HTTP + WS 服务器（~2500 行，原 4192）
├── ai_agent/                       # AI Agent 核心
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   └── agent.py                # Agent 核心逻辑（~1910 行，不变）
│   ├── state/                      # ★ 新增：状态管理
│   │   ├── __init__.py
│   │   ├── dom_snapshot.py         # 快照数据结构（~50 行）
│   │   ├── snapshot_manager.py     # 快照管理器（~150 行）
│   │   ├── protocol.py             # 推送协议（~80 行）
│   │   ├── carrier.py              # 载体适配器（~120 行）
│   │   └── session_sync.py         # 状态同步（~150 行）
│   ├── api/                        # ★ 新增：HTTP API
│   │   ├── __init__.py
│   │   ├── router.py               # 路由注册器（~50 行）
│   │   └── handlers.py             # API 处理函数（~400 行）
│   ├── db/                         # ★ 新增：数据库管理
│   │   ├── __init__.py
│   │   └── manager.py              # 数据库管理器（~30 行）
│   ├── sessions/
│   │   └── session_manager.py      # 会话管理（~527 行，不变）
│   ├── tools/                      # 工具系统（不变）
│   ├── skills/                     # 技能系统（不变）
│   └── memory/                     # 记忆系统（不变）
│
├── webui/                          # 前端
│   ├── index.html                  # 入口 HTML（420 行，不变）
│   ├── css/
│   │   └── style.css               # 样式（4760 行，不变）
│   └── js/
│       ├── app.js                  # ★ 重写：入口（15 行，原 235）
│       ├── core.js                 # ★ 新增：WS + 消息分发（60 行）
│       ├── renderer.js             # ★ 新增：统一渲染（200 行）
│       ├── api.js                  # HTTP 请求（43 行，保留）
│       ├── utils/
│       │   ├── escape.js           # escapeHtml（6 行，保留）
│       │   ├── i18n.js             # 国际化（1398 行，保留）
│       │   └── capabilities.js     # 能力检测（41 行，保留）
│       ├── components/
│       │   ├── toast.js            # 通知（660 行，保留）
│       │   ├── model-test.js       # 模型测试（207 行，保留）
│       │   └── agent-models.js     # 智能体模型（107 行，保留）
│       ├── chat/
│       │   ├── message.js          # ★ 精简：消息渲染（150 行，原 364）
│       │   ├── input.js            # ★ 精简：输入框（200 行，原 430）
│       │   ├── sidebar.js          # ★ 精简：侧边栏（200 行，原 657）
│       │   └── lang.js             # 语言（48 行，保留）
│       └── pages/
│           ├── sessions.js         # ★ 精简：会话管理（60 行，原 323）
│           ├── memory.js           # ★ 精简：记忆管理（50 行，原 158）
│           ├── agent-config.js     # ★ 精简：智能体配置（200 行，原 770）
│           ├── settings.js         # ★ 精简：全局设置（80 行，原 377）
│           ├── model-settings.js   # ★ 精简：模型管理（250 行，原 1032）
│           ├── theme.js            # ★ 精简：主题设置（100 行，原 283）
│           ├── skills.js           # ★ 精简：技能管理（40 行，原 90）
│           ├── token.js            # ★ 精简：Token 用量（100 行，原 355）
│           └── logs.js             # ★ 精简：日志（60 行，原 198）
│
├── agents/                         # 智能体配置（不变）
│   ├── default/
│   │   ├── config.json
│   │   ├── agent.md
│   │   ├── sessions/
│   │   │   └── sessions.db         # 会话数据库
│   │   ├── memory/
│   │   │   └── memory.md
│   │   └── skills/
│   └── token.db                    # Token 用量数据库
│
├── models.db                       # 模型配置数据库（不变）
├── docs/                           # 文档
│   ├── origin-architecture.md      # ★ 本文档
│   ├── 功能说明-v0.2.0.md          # 功能说明（可编辑版）
│   └── origin-dev-plan.md          # 开发步骤（已合并到本文档）
│
├── static/                         # 静态资源（不变）
├── knowledge-space/                # 知识空间（不变）
└── test_siper.py                   # 测试（不变）
```

### 24.2 文件变化对比

```
★ 新增文件（10 个）：
├── ai_agent/state/__init__.py           (5 行)
├── ai_agent/state/dom_snapshot.py       (50 行)
├── ai_agent/state/snapshot_manager.py   (150 行)
├── ai_agent/state/protocol.py           (80 行)
├── ai_agent/state/carrier.py            (120 行)
├── ai_agent/state/session_sync.py       (150 行)
├── ai_agent/api/__init__.py             (5 行)
├── ai_agent/api/router.py               (50 行)
├── ai_agent/api/handlers.py             (400 行)
├── ai_agent/db/__init__.py              (5 行)
├── ai_agent/db/manager.py               (30 行)
├── webui/js/core.js                     (60 行)
└── webui/js/renderer.js                 (200 行)
    新增小计：~1250 行

★ 重写文件（1 个）：
├── webui/js/app.js                      (235 → 15 行，-220)

★ 精简文件（15 个）：
├── webui/js/utils/dom.js                (1008 → 100 行，-908)
├── webui/js/pages/sessions.js           (323 → 60 行，-263)
├── webui/js/pages/memory.js             (158 → 50 行，-108)
├── webui/js/pages/agent-config.js       (770 → 200 行，-570)
├── webui/js/pages/settings.js           (377 → 80 行，-297)
├── webui/js/pages/model-settings.js     (1032 → 250 行，-782)
├── webui/js/pages/theme.js              (283 → 100 行，-183)
├── webui/js/pages/skills.js             (90 → 40 行，-50)
├── webui/js/pages/token.js              (355 → 100 行，-255)
├── webui/js/pages/logs.js               (198 → 60 行，-138)
├── webui/js/chat/message.js             (364 → 150 行，-214)
├── webui/js/chat/input.js               (430 → 200 行，-230)
├── webui/js/chat/sidebar.js             (657 → 200 行，-457)
├── siper_web.py                         (4192 → 2500 行，-1692)
    精简小计：-5185 行

★ 删除文件（3 个）：
├── webui/js/chat/state.js               (220 行 → 删除)
├── webui/js/chat/stream.js              (376 行 → 删除)
├── webui/js/utils/dom.js                (1008 行 → 删除，由 core.js + renderer.js 替代)
    删除小计：-1604 行

★ 保留文件（20+ 个）：
├── webui/css/style.css                  (4760 行，不变)
├── webui/index.html                     (420 行，不变)
├── webui/js/utils/i18n.js               (1398 行，不变)
├── webui/js/utils/escape.js             (6 行，不变)
├── webui/js/utils/capabilities.js       (41 行，不变)
├── webui/js/components/toast.js         (660 行，不变)
├── webui/js/components/model-test.js    (207 行，不变)
├── webui/js/components/agent-models.js  (107 行，不变)
├── webui/js/chat/lang.js                (48 行，不变)
├── webui/js/api.js                     (43 行，不变)
├── ai_agent/core/agent.py               (1910 行，不变)
├── ai_agent/sessions/session_manager.py (527 行，不变)
└── 其他 Python 模块（不变）
```

---

## 25. 代码量变化

| 模块 | 当前 | 目标 | 变化 |
|------|------|------|------|
| Python 后端 | 16,102 | ~13,000 | -3,102 |
| JS 前端 | 10,415 | ~3,500 | -6,915 |
| CSS | 4,760 | 4,760 | 0 |
| HTML | 420 | 420 | 0 |
| **总计** | **31,697** | **~21,680** | **-10,017** |

### 25.1 代码量分布（起源版）

```
Python 后端（~13,000 行）：
├── siper_web.py              2,500  (19%)  ← HTTP/WS 服务器
├── ai_agent/core/agent.py     1,910  (15%)  ← Agent 核心
├── ai_agent/state/             550   (4%)  ← ★ 新增状态管理
├── ai_agent/api/               450   (3%)  ← ★ 新增 API 层
├── ai_agent/db/                 30   (0%)  ← ★ 新增 DB 管理
├── ai_agent/sessions/          527   (4%)  ← 会话管理
├── ai_agent/tools/           2,000  (15%)  ← 工具系统
├── ai_agent/skills/          1,500  (12%)  ← 技能系统
├── ai_agent/memory/            800   (6%)  ← 记忆系统
└── 其他                      2,733  (21%)  ← 其他模块

JS 前端（~3,500 行）：
├── webui/js/utils/i18n.js     1,398  (40%)  ← 国际化（保留）
├── webui/js/components/        974  (28%)  ← 组件（保留）
├── webui/js/pages/             930  (27%)  ← ★ 精简后的页面
├── webui/js/chat/              598  (17%)  ← ★ 精简后的聊天模块
├── webui/js/core.js             60   (2%)  ← ★ 新增核心
├── webui/js/renderer.js        200   (6%)  ← ★ 新增渲染器
└── webui/js/utils/              47   (1%)  ← 工具函数（保留）
```

---

## 26. 验证清单

### Phase 0 完成标准
- [ ] `curl http://localhost:9724/api/v1/state/snapshot` 返回完整 JSON
- [ ] WS 连接后收到 state_full 消息
- [ ] 前端无 JS 错误

### Phase 1 完成标准
- [ ] 发送消息 → 流式输出 → AI 回复 完整
- [ ] 会话切换 → 消息历史正确
- [ ] 刷新页面 → 状态恢复

### Phase 2 完成标准
- [ ] 所有侧边栏导航正常
- [ ] 所有独立页面内容正确
- [ ] 表单操作（保存/删除）正常

### Phase 3 完成标准
- [ ] HTTP API 全部正常
- [ ] 所有 CRUD 操作正常
- [ ] 响应格式统一

### Phase 4 完成标准
- [ ] 废弃文件全部删除
- [ ] 无 console.error
- [ ] 内存使用稳定（不随时间增长）

---

> **文档结束**
>
> 这是"起源"版本的完整架构方案。
> 下一步：确认方案后开始 Phase 0 实施。
