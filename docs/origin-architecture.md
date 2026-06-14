# 起源（Origin）— SiPer v1.0.0 架构方案

> 代号：起源（Origin）
> 版本：v1.0.0-origin
> 设计时间：2026-07-28
> 目标：DOM 快照 + 数据库持久化，后端状态权威，前端纯展示，多载体互通

---

## 目录

1. [核心理念](#1-核心理念)
2. [架构全景](#2-架构全景)
3. [后端 DOM 快照管理器](#3-后端-dom-快照管理器)
4. [推送协议（v2）](#4-推送协议v2)
5. [前端架构](#5-前端架构)
6. [HTTP API 重构](#6-http-api-重构)
7. [多载体适配](#7-多载体适配)
8. [跨平台适配策略](#8-跨平台适配策略)
9. [代码去重与简化](#9-代码去重与简化)
10. [数据存储重构](#10-数据存储重构)
11. [实施路线图](#11-实施路线图)

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
  前端 → GET /api/sessions → 后端查 DB → 返回列表
  → 前端 renderSessionsList(data) → 渲染列表
```

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

### 2.2 设计原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **后端是状态权威** | 所有页面状态由后端计算和维护 |
| 2 | **前端是纯展示器** | 前端只做 DOM 更新，不做业务逻辑 |
| 3 | **通信是双通道** | WS 推实时数据，HTTP 拉按需数据 |
| 4 | **样式零改动** | CSS 和 HTML 结构完全保持不变 |
| 5 | **载体是适配器** | 不同载体只需实现 5 个回调函数 |

### 2.3 版本演进

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

### 3.1 快照数据结构

```python
# 文件：ai_agent/state/dom_snapshot.py

@dataclass
class DOMSnapshot:
    """前端 DOM 完整状态的内存快照"""

    # ===== 页面级状态 =====
    current_page: str = "chat"
    sidebar_expanded: bool = True
    sidebar_search: str = ""

    # ===== 会话列表 =====
    sessions: list = field(default_factory=list)
    active_session_id: str = None

    # ===== 聊天区域 =====
    chat_header_name: str = ""
    messages: list = field(default_factory=list)
    is_streaming: bool = False
    stream_text: str = ""
    stream_session_id: str = None
    is_thinking: bool = False
    thinking_text: str = ""
    is_sending: bool = False
    input_text: str = ""
    thinking_steps: list = field(default_factory=list)

    # ===== 中栏 =====
    agents: list = field(default_factory=list)
    expanded_agents: list = field(default_factory=list)

    # ===== 独立页面缓存 =====
    page_cache: dict = field(default_factory=dict)

    # ===== 全局 UI =====
    toasts: list = field(default_factory=list)
    dialog: dict = None

    # ===== 元数据 =====
    version: int = 0
    timestamp: str = ""
```

### 3.2 页面缓存结构

```python
# page_cache 详细结构

{
    # 会话管理页
    "sessions": {
        "list": [
            {
                "session_id": "abc123",
                "agent_name": "default",
                "agent_icon": "🎭",
                "last_message": "你好！我是...",
                "last_time": "2026-07-28T10:30:00",
                "unread": False,
                "message_count": 5
            }
        ],
        "preview_sid": "abc123",
        "preview_messages": [
            {"role": "user", "content": "你好", "time": "10:30:00"},
            {"role": "assistant", "content": "你好！...", "time": "10:30:05"}
        ]
    },

    # 记忆管理页
    "memory": {
        "agent": "default",
        "md_content": "# 记忆\n...",
        "config": {
            "mode_tokens": 2000,
            "mode": "append",
            "template": "{memory}"
        },
        "preview": "当前配置下，记忆将以..."
    },

    # 智能体配置页
    "agent_config": {
        "agent": "default",
        "tab": "about",
        "tabs": {
            "about": {
                "name": "AI Agent",
                "icon": "🎭",
                "msg_color": "#7c3aed",
                "msg_border": "#8b5cf6",
                "msg_font_size": 14,
                "msg_text": "#ffffff",
                "soul_content": "..."
            },
            "files": {
                "md_content": "...",
                "memory_content": "..."
            },
            "memory": {
                "path": "memory/memory.md",
                "max_tokens": 2000
            },
            "limits": {
                "llm_timeout": 300,
                "llm_max_retries": 2,
                "llm_max_tokens": 8192,
                "max_tool_rounds": 3,
                "max_concurrent_tools": 300,
                "session_timeout": 3600,
                "max_history_messages": 50,
                "memory_max_tokens": 2000,
                "skill_pre_filter_top_k": 5
            },
            "models": {
                "default_chat_model": "gpt-4",
                "default_vision_model": "",
                "agent_models": []
            },
            "avatar": {
                "avatar": "/static/default_avatar.webp"
            }
        }
    },

    # 监控页
    "monitor": {
        "active_tab": "token",
        "token": {
            "stats": {"total_tokens": 1000, "prompt_tokens": 600, "completion_tokens": 400},
            "chart_data": {"by_model": [...], "by_date": [...], "by_hour": [...]}
        },
        "logs": [
            {"time": "10:30:00", "level": "INFO", "logger": "agent", "message": "..."}
        ],
        "performance": {
            "port": 9724,
            "uptime": "2小时30分",
            "memory": "150MB",
            "cpu": "5%",
            "db_sizes": {"models.db": "1MB", "sessions.db": "5MB"}
        },
        "directory": "项目目录结构..."
    },

    # 技能页
    "skills": {
        "list": [
            {"name": "siper-coding", "version": "1.0", "enabled": True, "source": "md", "description": "..."}
        ],
        "filter": ""
    },

    # Token 用量页
    "token": {
        "stats": {"total_tokens": 1000, "by_model": {...}},
        "chart_data": {...}
    },

    # 全局设置页
    "settings": {
        "active_tab": "general",
        "cache": {
            "runtime_params": {},
            "meta_config": {}
        },
        "agents": [{"name": "default", "icon": "🎭"}]
    },

    # 主题设置页
    "theme": {
        "preset": "default",
        "colors": {"primary": "#7c3aed", "bg": "#0f0f23", ...},
        "sizes": {"font_size": 14, "sidebar_width": 280, ...},
        "templates": [{"name": "我的主题", "data": {...}}]
    },

    # 模型管理页
    "model_settings": {
        "models": [...],
        "search": "",
        "sort_by": "name",
        "sort_dir": "asc",
        "filter_caps": [],
        "discover_panel_open": False,
        "discover_preset": "",
        "discover_base_url": "",
        "discover_api_key": "",
        "add_model_form": {"name": "", "provider": "", "base_url": "", "api_key": "", "context": 8192}
    },

    # 日志页
    "logs": {
        "list": [...],
        "levels": [],
        "source": "",
        "search": "",
        "auto_refresh": True,
        "page": 1
    }
}
```

### 3.3 快照管理器实现

```python
# 文件：ai_agent/state/snapshot_manager.py

import asyncio
import copy
import json
import time
from typing import Any, Optional

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
            "page_cache": {},
            "toasts": [], "dialog": None,
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
        """解析路径 'sessions[0].last_message'"""
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

## 4. 推送协议（v2）

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

### 4.3 推送时机

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

## 5. 前端架构

### 5.1 核心原则

```
CSS 零改动 | HTML 零改动 | 只改 JS
```

### 5.2 文件结构（新）

```
webui/js/
├── app.js            # 入口（~30行）
├── core.js           # WS + 消息分发（~100行）
├── renderer.js       # 统一渲染（~200行）
├── api.js            # HTTP 请求（保留）
├── components/       # UI 组件（保留）
│   ├── toast.js
│   ├── model-test.js
│   └── agent-models.js
├── chat/             # 聊天模块（精简）
│   ├── message.js    # 消息渲染
│   ├── input.js      # 输入框
│   ├── sidebar.js    # 中栏
│   └── lang.js       # 语言
└── pages/            # 独立页面（精简）
    ├── sessions.js   # 纯渲染
    ├── memory.js     # 纯渲染
    ├── agent-config.js
    ├── settings.js
    ├── model-settings.js
    ├── theme.js
    ├── skills.js
    ├── token.js
    └── logs.js
```

### 5.3 core.js

```javascript
// core.js — 前端核心（~100行）

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

### 5.4 renderer.js

```javascript
// renderer.js — 统一渲染（~200行）

// 路径 → 处理函数映射
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
    // 按依赖顺序渲染
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
            // 精确匹配
            if (handlers[c.path]) { handlers[c.path](c.value); continue; }
            // 前缀匹配
            const prefix = c.path.replace(/\[\d+\].*/, '');
            if (handlers[prefix]) { handlers[prefix](c.value); continue; }
            // page_cache 更新
            if (c.path.startsWith('page_cache.')) {
                updatePageCache(c.path.slice(11), c.value);
            }
        }
        // insert / remove / move 由对应的列表处理器处理
    }
}

// 流式
export function appendStream(delta, sid) {
    let row = document.querySelector('.siper-stream-row');
    if (!row) row = createStreamRow(sid);
    const text = row.querySelector('.siper-stream-text');
    if (text) text.textContent += delta;
}

export function finalizeStream(data) {
    const row = document.querySelector('.siper-stream-row');
    if (!row) return;
    row.classList.remove('siper-stream-row');
    const text = row.querySelector('.siper-stream-text');
    if (text) text.textContent = data.response || '';
    if (data.tool_calls?.length) renderToolCalls(row, data.tool_calls);
    document.getElementById('chatSendBtn').disabled = false;
}
```

### 5.5 页面渲染函数

```javascript
// pages/sessions.js — 纯渲染（~30行）
export function renderSessions(list) {
    const el = document.getElementById('sessionsList');
    if (!el) return;
    el.innerHTML = list.map(s => `
        <div class="session-item ${s.unread ? 'unread' : ''}" data-sid="${s.session_id}">
            <span class="agent-icon">${s.agent_icon}</span>
            <span class="session-last-msg">${esc(s.last_message)}</span>
            <span class="session-time">${s.last_time}</span>
        </div>`).join('');
}

export function renderSessionPreview(msgs) {
    const el = document.getElementById('sessionPreview');
    if (!el) return;
    el.innerHTML = msgs.map(m => `
        <div class="message ${m.role}">
            <div class="bubble">${esc(m.content)}</div>
        </div>`).join('');
}

// pages/memory.js — 纯渲染（~20行）
export function renderMemoryContent(md, agent) {
    const ed = document.getElementById('memoryMdEditor');
    const lbl = document.getElementById('memoryAgentLabel');
    if (ed) ed.value = md;
    if (lbl) lbl.textContent = agent;
}

export function renderMemoryConfig(cfg) {
    const m = document.getElementById('memMode');
    const t = document.getElementById('memMaxTokens');
    const tpl = document.getElementById('memTemplate');
    if (m) m.value = cfg.mode;
    if (t) t.value = cfg.max_tokens;
    if (tpl) tpl.value = cfg.template;
}

// pages/agent-config.js — 纯渲染（~80行）
export function renderAgentConfig(data) {
    // about tab
    const name = document.getElementById('cfgAgentName');
    const icon = document.getElementById('cfgAgentIcon');
    if (name) name.value = data.tabs.about.name;
    if (icon) icon.textContent = data.tabs.about.icon;
    // ... 其他字段类似
}

// pages/monitor.js — 纯渲染（~40行）
export function renderMonitorToken(data) { /* 渲染 Token 图表 */ }
export function renderMonitorLogs(data) { /* 渲染日志列表 */ }
export function renderMonitorPerformance(data) { /* 渲染性能信息 */ }
export function renderMonitorDirectory(data) { /* 渲染目录树 */ }

// pages/settings.js — 纯渲染（~30行）
export function renderSettings(data) { /* 渲染设置表单 */ }

// pages/theme.js — 纯渲染（~30行）
export function renderTheme(data) { /* 渲染主题设置 */ }

// pages/skills.js — 纯渲染（~20行）
export function renderSkills(list) { /* 渲染技能列表 */ }

// pages/model-settings.js — 纯渲染（~40行）
export function renderModelList(list) { /* 渲染模型列表 */ }

// pages/token.js — 纯渲染（~20行）
export function renderTokenStats(data) { /* 渲染 Token 统计 */ }

// pages/logs.js — 纯渲染（~20行）
export function renderLogs(data) { /* 渲染日志 */ }
```

---

## 6. HTTP API 重构

### 6.1 路由注册器

```python
# 文件：ai_agent/api/router.py

class Router:
    """HTTP 路由注册器"""

    def __init__(self, prefix="/api/v1"):
        self.prefix = prefix
        self._routes = []  # [(method, path, handler)]

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

# 使用
router = Router()

@router.get("/sessions")
async def list_sessions(request):
    return ok(await get_sessions())

@router.get("/sessions/{session_id}")
async def get_session(request, session_id):
    return ok(await get_session_messages(session_id))

@router.get("/state/snapshot")
async def get_snapshot(request):
    return ok(snapshot_mgr.get_snapshot())

def ok(data):
    return {"code": 0, "data": data, "message": "ok"}
```

### 6.2 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/state/snapshot | 获取全量 DOM 快照 |
| GET | /api/v1/state/version | 获取快照版本号 |
| POST | /api/v1/message | 发消息（WS 备用） |

### 6.3 统一响应格式

```json
// 成功
{"code": 0, "data": {...}, "message": "ok"}

// 错误
{"code": 40001, "data": null, "message": "Session not found"}
```

---

## 7. 多载体适配

### 7.1 CarrierAdapter 接口

```python
# 文件：ai_agent/carrier/adapter.py

class CarrierAdapter:
    """载体适配器基类"""

    async def on_state_full(self, state: dict):
        raise NotImplementedError

    async def on_state_deltas(self, from_ver: int, to_ver: int, changes: list):
        raise NotImplementedError

    async def on_stream_delta(self, delta: str, session_id: str):
        raise NotImplementedError

    async def on_stream_end(self, data: dict):
        raise NotImplementedError

    async def on_tool_progress(self, tool: dict):
        raise NotImplementedError

    async def _send(self, msg: dict):
        raise NotImplementedError
```

### 7.2 WebUI 适配器

```python
class WebUIAdapter(CarrierAdapter):
    def __init__(self, ws):
        self.ws = ws

    async def _send(self, msg):
        await self.ws.send(json.dumps(msg, ensure_ascii=False, default=str))

    async def on_state_full(self, state):
        await self._send({"type": "state_full", "version": state["version"], "data": state})

    async def on_state_deltas(self, from_ver, to_ver, changes):
        await self._send({"type": "state_deltas", "from_version": from_ver, "to_version": to_ver, "changes": changes})

    async def on_stream_delta(self, delta, sid):
        await self._send({"type": "stream_delta", "delta": delta, "session_id": sid})

    async def on_stream_end(self, data):
        await self._send({"type": "stream_end", "data": data})

    async def on_tool_progress(self, tool):
        await self._send({"type": "tool_progress", **tool})
```

### 7.3 CLI 适配器

```python
class CLIAdapter(CarrierAdapter):
    async def on_state_full(self, state):
        print(f"[CLI] Session: {state.get('active_session_id')}")

    async def on_stream_delta(self, delta, sid):
        print(delta, end='', flush=True)

    async def on_stream_end(self, data):
        print()
        for tc in (data.get('tool_calls') or []):
            print(f"  🔧 {tc['tool_name']}")

    async def on_tool_progress(self, tool):
        icon = "⏳" if tool['status'] == 'running' else "✅"
        print(f"  {icon} {tool['tool_name']}")
```

### 7.4 API Server 适配器

```python
class APIAdapter(CarrierAdapter):
    """纯 HTTP API，不推送，缓存快照"""
    def __init__(self):
        self._snapshot = {}

    async def on_state_full(self, state):
        self._snapshot = state

    async def on_state_deltas(self, from_ver, to_ver, changes):
        for c in changes:
            if c['op'] == 'replace':
                self._apply(c['path'], c['value'])

    def get_snapshot(self):
        return self._snapshot
```

---

## 8. 跨平台适配策略

### 8.1 推荐方案：先做源码 + 打包

```
核心决策：SiPer 的核心是 Python 后端 + Web UI 前端。

层 1：Python 后端（天然跨平台）
├── Windows: python siper_web.py
├── macOS:   python siper_web.py
├── Linux:   python siper_web.py
└── 无需修改，Python 解释器适配

层 2：前端载体（需要适配）
├── Web UI:    浏览器（当前，完整功能）
├── Desktop:   Tauri 打包（推荐）
├── Android:   Capacitor 打包（推荐）
├── iOS:       Capacitor 打包（推荐）
└── PWA:      Service Worker（轻量）
```

### 8.2 技术选型

| 载体 | 技术 | 包体积 | 说明 |
|------|------|--------|------|
| Web UI | 浏览器 | 0 | 当前方案 |
| Windows/macOS/Linux | Tauri | ~5MB | Rust 壳 + Web UI |
| Android/iOS | Capacitor | ~10MB | WebView + Native |
| PWA | Service Worker | 0 | 浏览器安装 |

### 8.3 源码结构

```
siper/
├── src/                    # Python 源码（跨平台共享）
│   ├── siper_web.py
│   └── ai_agent/
├── webui/                  # 前端源码（跨平台共享）
│   ├── index.html
│   ├── css/
│   └── js/
├── tauri/                  # Tauri 桌面端
│   ├── src-tauri/          # Rust 壳
│   └── package.json
├── capacitor/              # Capacitor 移动端
│   ├── android/
│   ├── ios/
│   └── capacitor.config.json
└── scripts/
    ├── build_desktop.py    # 打包桌面端
    └── build_mobile.py     # 打包移动端
```

---

## 9. 代码去重与简化

### 9.1 前端去重

| 问题 | 当前 | 新方案 |
|------|------|--------|
| fetch + 渲染 | 22 处 fetch，每页重复 | WS 推送 + renderer.js |
| loading 状态 | 每页 innerHTML='加载中...' | 统一 Loading 组件 |
| 表单自动保存 | 每 input oninput=triggerAutoSave | data-bind 声明式绑定 |
| Tab 切换 | 每页重复 tab 逻辑 | 统一 Tab 组件 |

### 9.2 后端去重

| 问题 | 当前 | 新方案 |
|------|------|--------|
| API 路由 | 50+ if/elif | Router 装饰器注册 |
| 数据库 CRUD | 每模型重复 | Repository 基类 |
| WS 消息发送 | 多处 ws.send(json.dumps(...)) | adapter._send(msg) |

### 9.3 代码量预估

| 模块 | 当前 | 目标 | 减少 |
|------|------|------|------|
| 前端 JS | ~12,000 | ~2,000 | -83% |
| 后端 siper_web.py | 4,192 | ~2,500 | -40% |
| 新增 状态管理 | 0 | ~800 | +800 |
| **总计** | **~18,000** | **~7,000** | **-61%** |

---

## 10. 数据存储重构

### 10.1 数据库管理器

```python
# 文件：ai_agent/db/manager.py

class DatabaseManager:
    """统一数据库连接管理"""

    def __init__(self, root: Path):
        self._root = root
        self._conns = {}

    def conn(self, name: str) -> sqlite3.Connection:
        if name not in self._conns:
            path = self._path(name)
            c = sqlite3.connect(str(path), check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
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

## 11. 实施路线图

### Phase 0：基础设施（第 1 周）

```
Day 1-2: 后端 SnapshotManager
├── ai_agent/state/dom_snapshot.py — 数据结构
├── ai_agent/state/snapshot_manager.py — CRUD + delta + 推送
└── 单元测试

Day 3: 推送协议
├── ai_agent/state/protocol.py — 消息类型定义
├── 批量推送（50ms）
└── 断线重连 delta 补发

Day 4: 前端 core.js + renderer.js
├── WS 连接 + 消息分发
├── state_full → renderFull
├── state_delta → applyDelta
└── 流式输出集成

Day 5-7: 联调
├── 端到端验证
├── 消息发送 → 流式 → 完成
└── 断线重连测试
```

### Phase 1：聊天核心迁移（第 2 周）

```
Day 1-2: 聊天状态迁移
├── is_sending / is_streaming / is_thinking
├── 消息列表 / 流式文本 / 思考过程
└── 工具调用展示

Day 3-4: 会话状态迁移
├── 会话列表（含排序）
├── 活跃会话 / 未读标记
└── 会话切换

Day 5: 中栏状态迁移
├── 智能体分组 / 展开折叠 / 搜索
└── 智能体切换

Day 6-7: 集成测试
```

### Phase 2：独立页面迁移（第 3 周）

```
Day 1-2: 页面导航
├── navigate → WS 请求后端
├── 后端维护 current_page
└── 页面缓存策略

Day 3-5: 各页面数据流
├── sessions / memory / agent_config
├── monitor / skills / token
├── settings / theme / model_settings / logs
└── 统一渲染函数

Day 6-7: 集成测试 + 样式一致性
```

### Phase 3：API 重构 + 去重（第 4 周）

```
Day 1-2: API 路由重构
├── ai_agent/api/router.py
├── 统一响应格式
└── /api/v1/state/* 端点

Day 3-4: 代码去重
├── 前端 fetch → WS
├── 前端 loading 组件
├── 后端 Repository
└── 表单自动保存

Day 5: 文档 + 测试
```

### Phase 4：多载体 + 跨平台（第 5-6 周）

```
Day 1-3: CarrierAdapter
├── 接口定义
├── WebUIAdapter / CLIAdapter / APIAdapter
└── CarrierManager

Day 4-5: Tauri 桌面端
├── 项目初始化 + 嵌入 Web UI + 打包

Day 6: Capacitor 移动端（可选）
```

---

> **文档结束**
>
> 这是"起源"版本的完整架构方案。
> 下一步：确认方案后开始 Phase 0 实施。
