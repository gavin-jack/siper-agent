# SiPer v0.2.0 架构重构详细设计

> 设计时间：2026-07-28
> 状态：草案 v1
> 目标：后端状态管理 + 前端纯展示 + 多载体互通 + 跨平台适配

---

## 目录

1. [核心架构](#1-核心架构)
2. [后端 DOM 快照管理器](#2-后端-dom-快照管理器)
3. [推送协议设计](#3-推送协议设计)
4. [前端架构（保持现有样式）](#4-前端架构保持现有样式)
5. [HTTP API 重构](#5-http-api-重构)
6. [多载体适配方案](#6-多载体适配方案)
7. [跨平台适配方案](#7-跨平台适配方案)
8. [代码去重与简化](#8-代码去重与简化)
9. [数据存储重构](#9-数据存储重构)
10. [实施计划](#10-实施计划)

---

## 1. 核心架构

### 1.1 设计原则

```
┌─────────────────────────────────────────────────────┐
│                   SiPer v0.2.0 架构                  │
│                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │  状态管理层  │ ←→ │  通信层      │ ←→ │  展示层   │ │
│  │  (后端)     │    │  (WS+HTTP)  │    │  (前端)   │ │
│  └─────────────┘    └─────────────┘    └──────────┘ │
│        ↑                   ↑                  ↑      │
│   单一数据源            双通道通信          纯展示逻辑  │
│                                                      │
│  核心理念：后端知道页面应该长什么样，前端只负责渲染    │
└─────────────────────────────────────────────────────┘
```

**5 条设计原则**：

1. **后端是状态权威**：所有页面状态由后端计算和维护
2. **前端是纯展示器**：前端只做 DOM 更新，不做业务逻辑
3. **通信是双通道**：WS 推实时数据，HTTP 拉按需数据
4. **样式零改动**：CSS 和 HTML 结构完全保持不变
5. **载体是适配器**：不同载体只需实现 5 个回调函数

### 1.2 架构分层

```
┌──────────────────────────────────────────────────────────┐
│                      载体层（Carrier）                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ Web UI │ │  CLI   │ │ Desktop│ │ Mobile │ │  API   │ │
│  │ 浏览器 │ │ 终端   │ │ 桌面端 │ │ 移动端 │ │ Server │ │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ │
│      │          │          │          │          │       │
│      └──────────┴──────────┼──────────┴──────────┘       │
│                            │                              │
│                    ┌───────▼───────┐                      │
│                    │ CarrierAdapter│ ← 5 个回调接口       │
│                    └───────┬───────┘                      │
├────────────────────────────┼─────────────────────────────┤
│                     通信层                                │
│  ┌─────────────────────────┼──────────────────────────┐  │
│  │  WS 通道                │  HTTP 通道                │  │
│  │  state_full             │  GET /api/state/snapshot  │  │
│  │  state_delta            │  GET /api/sessions        │  │
│  │  stream_delta           │  GET /api/config          │  │
│  │  stream_end             │  POST /api/agents/{name}  │  │
│  │  tool_progress          │  ...                      │  │
│  └─────────────────────────┼──────────────────────────┘  │
├────────────────────────────┼─────────────────────────────┤
│                     状态管理层                             │
│                    ┌───────▼───────┐                      │
│                    │ DOMSnapshot   │                      │
│                    │ Manager       │                      │
│                    └───────┬───────┘                      │
│                            │                              │
│              ┌─────────────┼─────────────┐                │
│              │             │             │                │
│         ┌────▼────┐  ┌────▼────┐  ┌────▼────┐           │
│         │ Session │  │  Agent  │  │  Model  │           │
│         │ Manager │  │ Config  │  │  Config │           │
│         └─────────┘  └─────────┘  └─────────┘           │
│                                                          │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│         │  Skill  │  │  Tool   │  │  Token  │           │
│         │ System  │  │ Registry│  │  Usage  │           │
│         └─────────┘  └─────────┘  └─────────┘           │
├──────────────────────────────────────────────────────────┤
│                     持久化层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │sessions.db│  │models.db │  │ token.db │  │ 文件配置 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 后端 DOM 快照管理器

### 2.1 快照数据结构

```python
# siper_web.py 新增

@dataclass
class DOMSnapshot:
    """前端 DOM 完整状态的内存快照"""

    # ===== 页面级 =====
    current_page: str = "chat"
    sidebar_expanded: bool = True
    sidebar_search: str = ""

    # ===== 会话列表 =====
    sessions: list = field(default_factory=list)
    # 每项: {session_id, agent_name, agent_icon, last_message, last_time, unread, message_count}
    active_session_id: str = None

    # ===== 聊天区域 =====
    chat_header_name: str = ""
    messages: list = field(default_factory=list)
    # 每项: {message_id, role, content, timestamp, tool_calls, attachments}
    is_streaming: bool = False
    stream_text: str = ""
    is_thinking: bool = False
    thinking_text: str = ""
    is_sending: bool = False
    input_text: str = ""

    # ===== 中栏 =====
    agents: list = field(default_factory=list)
    # 每项: {name, icon, expanded, sessions: [{sid, last_msg, unread}]}
    expanded_agents: list = field(default_factory=list)

    # ===== 独立页面缓存 =====
    page_cache: dict = field(default_factory=dict)
    # {
    #   "sessions": {list, preview_sid, preview_msgs},
    #   "memory": {agent, md_content, config, preview},
    #   "agent_config": {agent, tab, tabs: {about, files, memory, limits, models, avatar}},
    #   "monitor": {active_tab, token, logs, performance, directory},
    #   "skills": {list, filter},
    #   "token": {stats, chart_data},
    #   "settings": {cache, active_tab, agents},
    #   "theme": {preset, colors, sizes, templates},
    # }

    # ===== 全局 UI =====
    toasts: list = field(default_factory=list)
    dialog: dict = None

    # ===== 元数据 =====
    version: int = 0
    timestamp: str = ""
```

### 2.2 快照管理器

```python
class DOMSnapshotManager:
    """前端 DOM 状态的内存管理器"""

    def __init__(self):
        self._snapshot = DOMSnapshot()
        self._version = 0
        self._lock = asyncio.Lock()
        self._delta_log: list = []       # 变更历史（用于断线补发）
        self._max_delta_log = 500
        self._clients: dict = {}          # conn_id → ws
        self._pending: list = []          # 批量推送队列
        self._batch_timer = None
        self._batch_interval = 0.05       # 50ms

    # ---- 快照操作 ----

    async def set(self, path: str, value):
        """设置快照路径的值"""
        async with self._lock:
            old = self._get_nested(path)
            if old == value:
                return
            self._set_nested(path, value)
            self._version += 1
            self._snapshot.version = self._version
            self._snapshot.timestamp = time.strftime("%Y-%m-%dT%H:%M:%S")
            delta = {"op": "replace", "path": path, "value": value}
            self._delta_log.append(delta)
            if len(self._delta_log) > self._max_delta_log:
                self._delta_log = self._delta_log[-self._max_delta_log:]
            await self._enqueue(delta)

    async def batch_set(self, changes: list):
        """批量设置 [(path, value), ...]"""
        async with self._lock:
            deltas = []
            for path, value in changes:
                old = self._get_nested(path)
                if old == value:
                    continue
                self._set_nested(path, value)
                deltas.append({"op": "replace", "path": path, "value": value})
            if not deltas:
                return
            self._version += 1
            self._snapshot.version = self._version
            self._delta_log.extend(deltas)
            for d in deltas:
                await self._enqueue(d)

    async def insert(self, path: str, index: int, value):
        """向列表插入"""
        async with self._lock:
            lst = self._get_nested(path)
            lst.insert(index, value)
            self._version += 1
            delta = {"op": "insert", "path": path, "index": index, "value": value}
            self._delta_log.append(delta)
            await self._enqueue(delta)

    async def remove(self, path: str, index: int):
        """从列表删除"""
        async with self._lock:
            lst = self._get_nested(path)
            lst.pop(index)
            self._version += 1
            delta = {"op": "remove", "path": path, "index": index}
            self._delta_log.append(delta)
            await self._enqueue(delta)

    async def move(self, path: str, from_idx: int, to_idx: int):
        """移动列表元素"""
        async with self._lock:
            lst = self._get_nested(path)
            item = lst.pop(from_idx)
            lst.insert(to_idx, item)
            self._version += 1
            delta = {"op": "move", "path": path, "from": from_idx, "to": to_idx}
            self._delta_log.append(delta)
            await self._enqueue(delta)

    # ---- 推送控制 ----

    async def _enqueue(self, delta):
        """加入批量队列"""
        self._pending.append(delta)
        if self._batch_timer:
            self._batch_timer.cancel()
        self._batch_timer = asyncio.create_task(self._flush())

    async def _flush(self):
        """50ms 后批量推送"""
        await asyncio.sleep(self._batch_interval)
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

    async def register(self, conn_id: str, ws):
        """新连接 → 发全量快照"""
        self._clients[conn_id] = ws
        await self._send(ws, {
            "type": "state_full",
            "version": self._version,
            "data": self._snapshot_to_dict()
        })

    async def register_with_version(self, conn_id: str, ws, last_version: int):
        """带版本号重连 → 补发缺失 deltas 或全量"""
        self._clients[conn_id] = ws
        if last_version >= self._version or last_version == 0:
            await self.register(conn_id, ws)
            return
        # 从 delta_log 中找缺失的
        missing = self._delta_log[last_version:]
        if missing and len(missing) < 100:
            await self._send(ws, {
                "type": "state_deltas",
                "from_version": last_version,
                "to_version": self._version,
                "changes": missing
            })
        else:
            await self.register(conn_id, ws)

    async def unregister(self, conn_id: str):
        self._clients.pop(conn_id, None)

    async def _broadcast(self, msg: dict):
        payload = json.dumps(msg, ensure_ascii=False, default=str)
        dead = []
        for cid, ws in self._clients.items():
            try:
                await ws.send(payload)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self._clients.pop(cid, None)

    async def _send(self, ws, msg: dict):
        await ws.send(json.dumps(msg, ensure_ascii=False, default=str))

    # ---- 嵌套路径 ----

    def _get_nested(self, path: str):
        parts = self._parse_path(path)
        obj = self._snapshot
        for p in parts:
            obj = obj[p] if isinstance(p, str) else obj[p]
        return obj

    def _set_nested(self, path: str, value):
        parts = self._parse_path(path)
        obj = self._snapshot
        for p in parts[:-1]:
            obj = obj[p] if isinstance(p, str) else obj[p]
        last = parts[-1]
        if isinstance(last, str):
            setattr(obj, last, value) if hasattr(obj, last) else obj.__setitem__(last, value)
        else:
            obj[last] = value

    def _parse_path(self, path: str) -> list:
        """'sessions[0].last_message' → ['sessions', 0, 'last_message']"""
        parts = []
        for seg in path.split('.'):
            if '[' in seg:
                key, idx = seg.split('[')
                parts.append(key)
                parts.append(int(idx.rstrip(']')))
            else:
                parts.append(seg)
        return parts

    def _snapshot_to_dict(self) -> dict:
        """快照转 dict（深拷贝）"""
        return copy.deepcopy(self._snapshot.__dict__)
```

### 2.3 快照与页面的映射

```
┌──────────────────────────────────────────────────────────┐
│                    前端页面区域                            │
│                                                           │
│  侧边栏 ← snapshot.current_page → 高亮                    │
│          snapshot.sidebar_expanded → 折叠                 │
│                                                           │
│  中栏   ← snapshot.agents[] → 智能体列表                   │
│          snapshot.expanded_agents → 展开                  │
│          snapshot.sidebar_search → 过滤                    │
│                                                           │
│  右栏   ← snapshot.messages[] → 消息列表                   │
│  (chat)  snapshot.is_streaming → 流式状态                  │
│          snapshot.stream_text → 流式文本                   │
│          snapshot.is_sending → 发送按钮                    │
│          snapshot.chat_header_name → 头部标题              │
│                                                           │
│  独立页面 ← snapshot.current_page → 决定显示哪个           │
│            snapshot.page_cache[name] → 页面数据            │
│                                                           │
│  全局 UI ← snapshot.toasts[] → 通知                       │
│           snapshot.dialog → 弹窗                          │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 推送协议设计

### 3.1 消息格式

#### 全量快照（state_full）

```json
{
  "type": "state_full",
  "version": 42,
  "timestamp": "2026-07-28T10:30:00",
  "data": {
    "current_page": "chat",
    "sidebar_expanded": true,
    "sessions": [...],
    "active_session_id": "abc123",
    "chat_header_name": "default",
    "messages": [...],
    "is_streaming": false,
    "agents": [...],
    "page_cache": {...}
  }
}
```

#### 增量更新（state_delta）

```json
{
  "type": "state_delta",
  "version": 43,
  "changes": [
    {"op": "replace", "path": "is_streaming", "value": true},
    {"op": "replace", "path": "sessions[0].last_message", "新的消息"},
    {"op": "move", "path": "sessions", "from": 5, "to": 0}
  ]
}
```

#### 流式增量（stream_delta）

```json
{
  "type": "stream_delta",
  "delta": "你好",
  "session_id": "abc123"
}
```

#### 流式完成（stream_end）

```json
{
  "type": "stream_end",
  "session_id": "abc123",
  "data": {
    "response": "你好！我是 AI 助手...",
    "tool_calls": [...],
    "usage": {"prompt_tokens": 100, "completion_tokens": 50},
    "model": "gpt-4",
    "processing_time_ms": 1234
  }
}
```

#### 工具进度（tool_progress）

```json
{
  "type": "tool_progress",
  "tool_name": "web_search",
  "status": "running|done|error",
  "info": {"query": "..."},
  "call_id": "web_search_123"
}
```

### 3.2 推送时机矩阵

| 状态变化 | 推送方式 | 内容 | 前端动作 |
|----------|---------|------|---------|
| 新会话创建 | state_delta | insert sessions[0] | 列表头部插入 |
| 会话消息更新 | state_delta | replace session.last_message | 更新预览 |
| 会话顺序变化 | state_delta | move sessions | DOM 节点移动 |
| 流式输出中 | stream_delta | delta text | 追加文本 |
| 流式完成 | stream_end | full response | 完成气泡 |
| 工具调用 | tool_progress | tool status | 更新工具卡片 |
| 配置变更 | state_delta | replace config.* | 更新表单 |
| 页面切换 | state_full | 完整快照 | 全量重建 |
| WS 重连 | state_full 或 state_deltas | 快照或补发 | 重建或补更新 |

### 3.3 批量推送机制

```
状态变化 1 → delta A → ┐
状态变化 2 → delta B → ├─ 50ms 窗口 → 合并为一次 state_delta 推送
状态变化 3 → delta C → ┘

例外：stream_delta 不批量（需要实时性）
例外：state_full 不批量（本身就大）
```

---

## 4. 前端架构（保持现有样式）

### 4.1 核心原则

**CSS 零改动、HTML 零改动、只改 JS。**

```
保留不动（~26000 行代码）：
├── css/style.css          # 1222 行 CSS，不动
├── index.html             # 420 行 HTML，不动
├── 所有 tpl-* 模板         # 不动
├── 所有 siper-* class      # 不动
├── 所有 CSS 变量           # 不动
└── 所有组件 HTML 结构       # 不动

只改 JS（~12000 行 → ~2000 行）：
├── 删除 state.js           # 状态由后端管理
├── 重写 dom.js → core.js   # 只做 WS 连接 + 消息分发
├── 重写 chat.js            # 只做渲染，删除业务逻辑
├── 精简所有 pages/*.js     # 删除 fetch，只做 DOM 渲染
└── 新增 renderer.js        # 统一 DOM 渲染函数
```

### 4.2 前端文件结构（新）

```
webui/js/
├── app.js              # ESM 入口（~50 行，只做路由+挂载）
├── core.js             # WS 连接 + 状态分发（~150 行）
├── renderer.js         # 统一 DOM 渲染（~300 行）
├── api.js              # HTTP 请求（保留，精简）
├── components/         # UI 组件（保留）
│   ├── toast.js        # 通知/弹窗
│   ├── model-test.js   # 模型测试
│   └── agent-models.js # 模型选择
├── chat/               # 聊天模块（精简）
│   ├── message.js      # 消息渲染（纯展示）
│   ├── input.js        # 输入框（保留）
│   ├── sidebar.js      # 中栏（纯展示）
│   └── lang.js         # 语言切换（保留）
└── pages/              # 独立页面（精简）
    ├── sessions.js     # 纯渲染
    ├── memory.js       # 纯渲染
    ├── agent-config.js # 纯渲染
    ├── settings.js     # 纯渲染
    ├── model-settings.js # 纯渲染
    ├── theme.js        # 纯渲染
    ├── skills.js       # 纯渲染
    ├── token.js        # 纯渲染
    └── logs.js         # 纯渲染
```

### 4.3 core.js 设计

```javascript
// core.js — 前端核心（~150 行）

import { renderFull, applyDelta, appendStream, finalizeStream } from './renderer.js';

let ws = null;
let version = 0;

export function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = parseInt(location.port) + 1;
    ws = new WebSocket(`${proto}//${location.hostname}:${port}`);

    ws.onopen = () => {};

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
            case 'state_full':
                version = msg.version;
                renderFull(msg.data);
                break;
            case 'state_delta':
                version = msg.version;
                applyDelta(msg.changes);
                break;
            case 'stream_delta':
                appendStream(msg.delta);
                break;
            case 'stream_end':
                finalizeStream(msg.data);
                break;
            case 'tool_progress':
                updateToolProgress(msg);
                break;
            case 'connected':
                // 连接成功
                break;
        }
    };

    ws.onclose = () => {
        setTimeout(connectWS, 3000);
    };
}

// 发送消息
export function sendMessage(content, options = {}) {
    ws?.send(JSON.stringify({
        type: 'message', content,
        session_id: options.session_id,
        agent: options.agent,
        model: options.model
    }));
}

// 停止生成
export function sendStop() {
    ws?.send(JSON.stringify({type: 'stop'}));
}

// 创建会话
export function createSession(agent = 'default') {
    ws?.send(JSON.stringify({type: 'new_session', agent}));
}

// 切换会话
export function switchSession(sessionId) {
    ws?.send(JSON.stringify({type: 'switch_session', session_id: sessionId}));
}

// 页面导航
export function navigateToPage(page) {
    ws?.send(JSON.stringify({type: 'navigate', page}));
}
```

### 4.4 renderer.js 设计

```javascript
// renderer.js — 统一 DOM 渲染（~300 行）

// 全量快照渲染
export function renderFull(snap) {
    // 页面路由
    if (snap.current_page === 'chat') {
        showChatPage();
        renderChatHeader(snap.chat_header_name);
        renderMessages(snap.messages);
        renderAgents(snap.agents, snap.expanded_agents);
        updateSidebarActive(snap.current_page);
        updateStreaming(snap.is_streaming, snap.stream_text);
        updateThinking(snap.is_thinking, snap.thinking_text);
        updateSending(snap.is_sending);
    } else {
        showStandalonePage(snap.current_page, snap.page_cache);
    }
    updateSidebarExpanded(snap.sidebar_expanded);
}

// 增量更新
export function applyDelta(changes) {
    for (const c of changes) {
        switch (c.op) {
            case 'replace': applyReplace(c.path, c.value); break;
            case 'insert': applyInsert(c.path, c.index, c.value); break;
            case 'remove': applyRemove(c.path, c.index); break;
            case 'move': applyMove(c.path, c.from, c.to); break;
        }
    }
}

// 路径 → DOM 更新函数映射
const replaceHandlers = {
    'is_streaming': v => updateStreaming(v),
    'stream_text': v => updateStreamText(v),
    'is_thinking': v => updateThinking(v),
    'is_sending': v => updateSending(v),
    'chat_header_name': v => updateChatHeader(v),
    'current_page': v => switchPage(v),
    'sidebar_expanded': v => updateSidebarExpanded(v),
    'active_session_id': v => updateActiveSession(v),
};

function applyReplace(path, value) {
    // 精确匹配
    if (replace_handlers[path]) {
        replace_handlers[path](value);
        return;
    }
    // 前缀匹配
    if (path.startsWith('sessions[')) { updateSessionItem(path, value); }
    else if (path.startsWith('messages[')) { updateMessageItem(path, value); }
    else if (path.startsWith('page_cache.')) { updatePageCache(path, value); }
    else if (path.startsWith('agents[')) { updateAgentItem(path, value); }
}

// 流式输出
export function appendStream(delta) {
    const textEl = document.querySelector('.siper-stream-text');
    if (textEl) textEl.textContent += delta;
}

export function finalizeStream(data) {
    const row = document.querySelector('.siper-stream-row');
    if (!row) return;
    row.classList.remove('siper-stream-row');
    const textEl = row.querySelector('.siper-stream-text');
    if (textEl) textEl.textContent = data.response || '';
    if (data.tool_calls?.length) renderToolCalls(row, data.tool_calls);
    updateSending(false);
}
```

### 4.5 页面渲染函数（精简示例）

```javascript
// 各页面的渲染函数（只做 DOM 更新，不做数据获取）

// sessions.js — 纯渲染
export function renderSessionsList(sessions) {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    list.innerHTML = sessions.map(s => `
        <div class="session-item ${s.unread ? 'unread' : ''}" data-sid="${s.session_id}">
            <span class="agent-icon">${s.agent_icon}</span>
            <span class="session-last-msg">${s.last_message}</span>
            <span class="session-time">${s.last_time}</span>
        </div>
    `).join('');
}

export function renderSessionPreview(messages) {
    const preview = document.getElementById('sessionPreview');
    if (!preview) return;
    preview.innerHTML = messages.map(m => `
        <div class="message ${m.role}">
            <div class="bubble">${m.content}</div>
        </div>
    `).join('');
}

// memory.js — 纯渲染
export function renderMemoryContent(md, agent) {
    const editor = document.getElementById('memoryMdEditor');
    const label = document.getElementById('memoryAgentLabel');
    if (editor) editor.value = md;
    if (label) label.textContent = agent;
}

export function renderMemoryConfig(config) {
    const mode = document.getElementById('memMode');
    const tokens = document.getElementById('memMaxTokens');
    const template = document.getElementById('memTemplate');
    if (mode) mode.value = config.mode;
    if (tokens) tokens.value = config.max_tokens;
    if (template) template.value = config.template;
}
```

---

## 5. HTTP API 重构

### 5.1 重构目标

当前 siper_web.py 有 50+ 个 if/elif 路由判断，需要重构为结构化的路由注册。

### 5.2 新 API 设计

```python
# 路由注册装饰器
@router.get("/api/v1/sessions")
async def list_sessions(request):
    ...

@router.get("/api/v1/sessions/{session_id}")
async def get_session(request, session_id: str):
    ...

@router.post("/api/v1/sessions")
async def create_session(request):
    ...

@router.delete("/api/v1/sessions/{session_id}")
async def delete_session(request, session_id: str):
    ...
```

### 5.3 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/state/snapshot | 获取全量 DOM 快照 |
| GET | /api/v1/state/version | 获取快照版本号 |
| POST | /api/v1/message | 发消息（WS 备用） |
| GET | /api/v1/status | 系统状态 |
| GET | /api/v1/config | 全局配置 |
| PUT | /api/v1/config | 更新配置 |

### 5.4 统一响应格式

```json
// 成功
{
  "code": 0,
  "data": {...},
  "message": "ok"
}

// 错误
{
  "code": 40001,
  "data": null,
  "message": "Session not found"
}
```

---

## 6. 多载体适配方案

### 6.1 CarrierAdapter 接口

```python
class CarrierAdapter:
    """载体适配器基类"""

    async def on_state_full(self, state: dict):
        """收到全量状态快照"""
        raise NotImplementedError

    async def on_state_delta(self, changes: list):
        """收到增量更新"""
        raise NotImplementedError

    async def on_stream_delta(self, delta: str, session_id: str):
        """收到流式增量"""
        raise NotImplementedError

    async def on_stream_end(self, data: dict):
        """收到流式完成"""
        raise NotImplementedError

    async def on_tool_progress(self, tool: dict):
        """收到工具进度"""
        raise NotImplementedError

    async def on_toast(self, toast: dict):
        """收到通知"""
        pass
```

### 6.2 各载体实现

#### WebUI 适配器

```python
class WebUIAdapter(CarrierAdapter):
    def __init__(self, ws):
        self.ws = ws

    async def on_state_full(self, state):
        await self.ws.send(json.dumps({"type": "state_full", "data": state}))

    async def on_state_delta(self, changes):
        await self.ws.send(json.dumps({"type": "state_delta", "changes": changes}))

    async def on_stream_delta(self, delta, sid):
        await self.ws.send(json.dumps({"type": "stream_delta", "delta": delta, "session_id": sid}))

    async def on_stream_end(self, data):
        await self.ws.send(json.dumps({"type": "stream_end", "data": data}))

    async def on_tool_progress(self, tool):
        await self.ws.send(json.dumps({"type": "tool_progress", **tool}))
```

#### CLI 适配器

```python
class CLIAdapter(CarrierAdapter):
    async def on_state_full(self, state):
        print(f"[CLI] Active session: {state.get('active_session_id')}")

    async def on_stream_delta(self, delta, sid):
        print(delta, end='', flush=True)

    async def on_stream_end(self, data):
        print()  # 换行
        if data.get('tool_calls'):
            for tc in data['tool_calls']:
                print(f"  🔧 {tc['tool_name']}")

    async def on_tool_progress(self, tool):
        if tool['status'] == 'running':
            print(f"  ⏳ {tool['tool_name']}...")
        elif tool['status'] == 'done':
            print(f"  ✅ {tool['tool_name']}")
```

#### API Server 适配器

```python
class APIAdapter(CarrierAdapter):
    """纯 HTTP API，不推送，按需响应"""
    def __init__(self):
        self._snapshot = {}

    async def on_state_full(self, state):
        self._snapshot = state  # 缓存最新快照

    async def on_state_delta(self, changes):
        # 应用 delta 到缓存
        for c in changes:
            self._apply_delta(c)

    def get_snapshot(self):
        return self._snapshot
```

### 6.3 多载体并发

```python
class CarrierManager:
    """管理所有载体连接"""

    def __init__(self):
        self._carriers: dict[str, CarrierAdapter] = {}

    def register(self, conn_id: str, adapter: CarrierAdapter):
        self._carriers[conn_id] = adapter

    def unregister(self, conn_id: str):
        self._carriers.pop(conn_id, None)

    async def broadcast_state_full(self, state):
        for adapter in self._carriers.values():
            try:
                await adapter.on_state_full(state)
            except Exception:
                pass

    async def broadcast_delta(self, changes):
        for adapter in self._carriers.values():
            try:
                await adapter.on_state_delta(changes)
            except Exception:
                pass
```

---

## 7. 跨平台适配方案

### 7.1 推荐方案：先做源码 + 打包

**核心决策**：SiPer 的核心是 Python 后端 + Web UI 前端。跨平台适配分两层：

```
┌─────────────────────────────────────────────┐
│              跨平台策略                       │
│                                              │
│  层 1：Python 后端（天然跨平台）              │
│  ├── Windows: python siper_web.py            │
│  ├── macOS:   python siper_web.py            │
│  ├── Linux:   python siper_web.py            │
│  └── 无需修改，Python 解释器适配              │
│                                              │
│  层 2：前端载体（需要适配）                   │
│  ├── Web UI:    浏览器（当前）               │
│  ├── Desktop:   Tauri 打包（推荐）           │
│  ├── Android:   Capacitor 打包（推荐）       │
│  ├── iOS:       Capacitor 打包（推荐）       │
│  └── PWA:      Service Worker（轻量）         │
└─────────────────────────────────────────────┘
```

### 7.2 推荐技术栈

| 载体 | 技术 | 打包方式 | 说明 |
|------|------|---------|------|
| **Web UI** | 浏览器 | 无需打包 | 当前方案，完整功能 |
| **Windows** | Tauri | `tauri build` → .msi/.exe | Rust 壳 + Web UI |
| **macOS** | Tauri | `tauri build` → .dmg/.app | Rust 壳 + Web UI |
| **Linux** | Tauri | `tauri build` → .deb/.AppImage | Rust 壳 + Web UI |
| **Android** | Capacitor | `cap add android` → .apk/.aab | WebView + Native |
| **iOS** | Capacitor | `cap add ios` → .ipa | WebView + Native |
| **PWA** | Service Worker | 浏览器安装 | 轻量离线支持 |

### 7.3 为什么不选 Electron

| 对比项 | Tauri | Electron |
|--------|-------|----------|
| 包体积 | ~5 MB | ~150 MB |
| 内存占用 | ~50 MB | ~300 MB |
| 启动速度 | <1s | ~3s |
| Rust 依赖 | 需要 | 不需要 |
| 成熟度 | 较新 | 成熟 |

### 7.4 实施策略

```
Phase 1: Web UI 重构（本期重点）
├── 完成后端状态管理
├── 完成前端纯展示改造
└── 保持浏览器访问

Phase 2: Tauri 桌面端（后续）
├── 创建 Tauri 项目
├── 嵌入 Web UI 资源
├── 添加系统托盘
└── 打包 Windows/macOS/Linux

Phase 3: Capacitor 移动端（后续）
├── 创建 Capacitor 项目
├── 嵌入 Web UI 资源
├── 添加原生功能（推送/相机）
└── 打包 Android/iOS

Phase 4: PWA（可选）
├── 添加 Service Worker
├── manifest.json
└── 离线缓存策略
```

### 7.5 源码结构（支持多载体打包）

```
siper/
├── src/                      # Python 源码
│   ├── siper_web.py         # 主入口
│   ├── ai_agent/             # Agent 核心
│   └── ...
├── webui/                    # 前端源码
│   ├── index.html
│   ├── css/
│   └── js/
├── tauri/                    # Tauri 桌面端（新增）
│   ├── src-tauri/            # Rust 壳
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/main.rs
│   └── src/                  # Web UI 入口
├── capacitor/                 # Capacitor 移动端（新增）
│   ├── android/
│   ├── ios/
│   └── capacitor.config.json
├── pwa/                      # PWA 配置（新增）
│   ├── manifest.json
│   └── sw.js
└── scripts/
    ├── build_desktop.py      # 打包桌面端
    ├── build_mobile.py       # 打包移动端
    └── build_pwa.py          # 打包 PWA
```

---

## 8. 代码去重与简化

### 8.1 前端去重

#### 问题 1：fetch + 渲染模式重复

**当前**：每个页面都有类似的 fetch → innerHTML 模式（22 处 fetch 调用）

**解决**：统一为 WS 推送 + renderer.js 渲染

```javascript
// 当前（每个页面都有）：
async function refreshSessions() {
    const r = await fetch('/api/sessions');
    const data = await r.json();
    const list = document.getElementById('sessionsList');
    list.innerHTML = data.sessions.map(s => `...`).join('');
}

// 新架构（统一）：
// 后端推送 state_delta → sessions 更新
// renderer.js 自动调用 renderSessionsList(sessions)
```

#### 问题 2：loading 状态重复

**当前**：每个页面都有 `innerHTML = '加载中...'` → `innerHTML = '加载失败'`

**解决**：统一 loading 组件

```javascript
// components/loading.js
export function showLoading(container) {
    container.innerHTML = '<div class="loading-spinner">加载中...</div>';
}

export function showError(container, msg) {
    container.innerHTML = `<div class="error-state">加载失败: ${msg}</div>`;
}
```

#### 问题 3：表单自动保存重复

**当前**：agent-config 中每个 input 都有 `oninput="triggerAgentAutoSave()"`

**解决**：统一表单绑定

```javascript
// 新架构：通过 data-bind 属性声明式绑定
// <input data-bind="agent.name" data-auto-save="true">
// 框架自动监听变化并保存
```

#### 问题 4：Tab 切换逻辑重复

**当前**：多个页面有类似的 tab 切换逻辑

**解决**：统一 Tab 组件

```javascript
// components/tabs.js
export function initTabs(container, onSwitch) {
    container.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            container.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('active', t === tab));
            onSwitch(name);
        });
    });
}
```

### 8.2 后端去重

#### 问题 1：API 路由链式判断

**当前**：50+ 个 if/elif

**解决**：路由注册器

```python
# 新架构
class Router:
    def __init__(self):
        self._routes = []

    def get(self, path):
        def decorator(fn):
            self._routes.append(('GET', path, fn))
            return fn
        return decorator

    def post(self, path):
        def decorator(fn):
            self._routes.append(('POST', path, fn))
            return fn
        return decorator

    async def dispatch(self, method, path, request):
        for m, p, fn in self._routes:
            if m == method and self._match(p, path):
                return await fn(request)
        return {"code": 404, "message": "Not found"}

router = Router()

@router.get("/api/v1/sessions")
async def list_sessions(request):
    return {"code": 0, "data": await get_sessions()}

@router.get("/api/v1/sessions/{session_id}")
async def get_session(request, session_id):
    return {"code": 0, "data": await get_session_messages(session_id)}
```

#### 问题 2：数据库 CRUD 重复

**当前**：每个数据模型都有类似的增删改查

**解决**：通用 Repository

```python
class Repository:
    """通用数据库仓库"""

    def __init__(self, db_path, table, model_cls):
        self.db_path = db_path
        self.table = table
        self.model_cls = model_cls

    async def find_all(self, **filters):
        ...

    async def find_one(self, id):
        ...

    async def create(self, item):
        ...

    async def update(self, id, data):
        ...

    async def delete(self, id):
        ...

# 使用
session_repo = Repository("sessions.db", "sessions", Session)
model_repo = Repository("models.db", "models", Model)
```

### 8.3 代码量预估

| 模块 | 当前行数 | 目标行数 | 减少 |
|------|---------|---------|------|
| 前端 JS | ~12000 | ~2000 | -83% |
| 后端 siper_web.py | 4192 | ~2500 | -40% |
| 后端 Agent 核心 | 1910 | ~1500 | -22% |
| 新增 状态管理器 | 0 | ~500 | +500 |
| 新增 路由注册器 | 0 | ~200 | +200 |
| **总计** | **~18000** | **~6700** | **-63%** |

---

## 9. 数据存储重构

### 9.1 目标

统一数据库连接管理，添加数据库迁移机制。

### 9.2 数据库管理器

```python
class DatabaseManager:
    """统一数据库连接管理"""

    def __init__(self, project_root: Path):
        self.root = project_root
        self._connections: dict[str, sqlite3.Connection] = {}

    def get_connection(self, name: str) -> sqlite3.Connection:
        """获取数据库连接（单例）"""
        if name not in self._connections:
            db_path = self._get_db_path(name)
            conn = sqlite3.connect(str(db_path), check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.row_factory = sqlite3.Row
            self._connections[name] = conn
        return self._connections[name]

    def _get_db_path(self, name: str) -> Path:
        paths = {
            "sessions": self.root / "agents" / "default" / "sessions" / "sessions.db",
            "models": self.root / "models.db",
            "token": self.root / "agents" / "token.db",
            "skill_log": self.root / "skills" / "skill_call_log.db",
        }
        return paths[name]

    def close_all(self):
        for conn in self._connections.values():
            conn.close()
        self._connections.clear()
```

### 9.3 数据库迁移

```python
class MigrationManager:
    """数据库迁移管理"""

    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self._migrations: dict[str, list] = {
            "sessions": [
                "CREATE TABLE IF NOT EXISTS sessions (...)",
                "CREATE TABLE IF NOT EXISTS messages (...)",
                "CREATE INDEX IF NOT EXISTS idx_messages_sid ON messages(session_id)",
            ],
            "models": [
                "CREATE TABLE IF NOT EXISTS providers (...)",
                "CREATE TABLE IF NOT EXISTS models (...)",
            ],
            "token": [
                "CREATE TABLE IF NOT EXISTS token_models (...)",
                "CREATE TABLE IF NOT EXISTS token_usage (...)",
            ],
        }

    async def migrate(self):
        """执行所有迁移"""
        for db_name, sqls in self._migrations.items():
            conn = self.db.get_connection(db_name)
            for sql in sqls:
                conn.execute(sql)
            conn.commit()
```

---

## 10. 实施计划

### Phase 0：基础设施（第 1 周）

```
目标：搭建骨架，不影响现有功能

Day 1-2: 后端 DOMSnapshotManager
├── 快照数据结构定义
├── 嵌套路径 CRUD（get/set/insert/remove/move）
├── 增量计算 + delta_log
├── 批量推送（50ms 窗口）
└── 单元测试

Day 3: WS 推送协议
├── state_full / state_delta / stream_* 消息格式
├── 断线重连 delta 补发
└── 版本号管理

Day 4: 前端 core.js + renderer.js
├── WS 连接 + 消息分发
├── state_full → renderFull
├── state_delta → applyDelta
└── 流式输出集成

Day 5-7: 联调 + 测试
├── 后端快照 → 前端渲染 端到端
├── 消息发送 → 流式 → 完成 全链路
└── 断线重连测试
```

### Phase 1：聊天核心迁移（第 2 周）

```
目标：聊天页面状态管理移入后端

Day 1-2: 聊天状态迁移
├── is_sending / is_streaming / is_thinking
├── 消息列表
├── 流式文本
└── 思考过程

Day 3-4: 会话状态迁移
├── 会话列表（含排序）
├── 活跃会话
└── 未读标记

Day 5: 中栏状态迁移
├── 智能体分组
├── 展开/折叠
└── 搜索过滤

Day 6-7: 集成测试
├── 多会话切换
├── 新会话创建
└── 流式并发
```

### Phase 2：独立页面迁移（第 3 周）

```
目标：所有独立页面改为快照驱动

Day 1-2: 页面导航
├── navigateToPage → 请求后端
├── 后端维护 current_page
└── 页面缓存策略

Day 3-5: 各页面数据流
├── sessions / memory / agent_config
├── monitor / skills / token
├── settings / theme
└── 统一渲染函数

Day 6-7: 集成测试
├── 所有页面切换
├── 数据正确性验证
└── 样式一致性检查
```

### Phase 3：API 重构 + 去重（第 4 周）

```
目标：HTTP API 重构 + 代码去重

Day 1-2: API 路由重构
├── 路由注册器
├── 统一响应格式
└── /api/v1/state/* 端点

Day 3-4: 代码去重
├── 前端 fetch → WS 推送
├── 前端 loading 组件统一
├── 后端 Repository 模式
└── 表单自动保存统一

Day 5: 文档 + 测试
├── API 文档
├── 架构文档
└── 集成测试
```

### Phase 4：多载体 + 跨平台（第 5-6 周）

```
目标：多载体适配 + 桌面端打包

Day 1-3: CarrierAdapter 接口
├── 接口定义
├── WebUIAdapter / CLIAdapter / APIAdapter
└── CarrierManager

Day 4-5: Tauri 桌面端
├── Tauri 项目初始化
├── 嵌入 Web UI
└── 打包测试

Day 6: Capacitor 移动端（可选）
├── Capacitor 项目初始化
├── 嵌入 Web UI
└── 打包测试
```

---

## 附录：关键文件改动清单

### 后端改动

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| siper_web.py | 重构 | 新增 DOMSnapshotManager，改造 WS handler |
| agent.py | 修改 | process_message 集成快照回调 |
| session_manager.py | 修改 | 集成快照更新 |
| models_db.py | 修改 | 集成快照更新 |
| 新增 state_manager.py | 新建 | DOM 快照管理器 |
| 新增 router.py | 新建 | HTTP 路由注册器 |
| 新增 repository.py | 新建 | 通用数据库仓库 |
| 新增 carrier.py | 新建 | 载体适配器 |

### 前端改动

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| app.js | 精简 | 只做路由+挂载 |
| dom.js | 删除 | 替换为 core.js |
| chat.js | 重写 | 只做渲染 |
| state.js | 删除 | 状态由后端管理 |
| stream.js | 精简 | 只做 DOM 追加 |
| message.js | 精简 | 只做渲染 |
| sidebar.js | 精简 | 只做渲染 |
| input.js | 保留 | 输入框逻辑 |
| 新增 core.js | 新建 | WS 连接 + 消息分发 |
| 新增 renderer.js | 新建 | 统一 DOM 渲染 |
| 新增 components/loading.js | 新建 | 统一 loading 组件 |
| 新增 components/tabs.js | 新建 | 统一 Tab 组件 |
| pages/*.js | 精简 | 删除 fetch，只做渲染 |
