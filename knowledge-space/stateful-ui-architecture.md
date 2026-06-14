# SiPer v0.2.0 有状态 UI 架构详细设计

> 设计时间：2026-07-28
> 状态：草案 v2（DOM 详细设计 + 实现规划）
> 目标：后端管理全部状态，前端纯展示层，保持现有样式风格

---

## Part 1：DOM 快照管理器详细设计

### 1.1 什么是 DOM 快照

DOM 快照是后端内存中的一棵 **状态树**，精确描述了前端页面应该呈现的样子。

```
前端页面 = f(DOM 快照)
```

**核心原则**：后端知道"页面应该长什么样"，前端只需要"把页面更新成这样"。

### 1.2 快照数据结构

```python
@dataclass
class DOMSnapshot:
    """前端 DOM 完整状态的内存快照"""

    # ===== 页面级状态 =====
    current_page: str = "chat"          # 当前活跃页面
    sidebar_expanded: bool = True       # 侧边栏展开/折叠
    sidebar_search: str = ""             # 搜索框内容

    # ===== 会话列表 =====
    sessions: List[SessionCard] = []    # 会话卡片列表（按展示顺序）
    active_session_id: str = None       # 当前选中会话

    # ===== 聊天区域 =====
    chat_header_name: str = ""          # 右栏头部标题
    messages: List[MessageCard] = []    # 当前会话消息列表
    is_streaming: bool = False          # 是否正在流式输出
    stream_text: str = ""               # 当前流式文本
    is_thinking: bool = False           # 是否显示思考面板
    thinking_text: str = ""             # 思考过程文本
    is_sending: bool = False            # 是否正在发送（禁用输入框）
    input_text: str = ""                # 输入框当前内容

    # ===== 中栏（智能体列表）=====
    agents: List[AgentGroup] = []       # 智能体分组列表
    expanded_agents: Set[str] = set()   # 展开的智能体

    # ===== 独立页面缓存 =====
    page_cache: Dict[str, Any] = {}    # 各独立页面的缓存数据
    # page_cache 示例:
    # {
    #   "sessions": { "list": [...], "preview_sid": "xxx", "preview_msgs": [...] },
    #   "memory": { "agent": "default", "md_content": "...", "config": {...} },
    #   "agent_config": { "agent": "default", "tab": "about", "form_data": {...} },
    #   "monitor": { "active_tab": "token", "token_data": {...}, "logs": [...] },
    #   "skills": { "list": [...], "filter": "" },
    #   "token": { "stats": {...}, "chart_data": {...} },
    #   "settings": { "cache": {...}, "active_tab": "general" },
    # }

    # ===== 全局通知 =====
    toasts: List[ToastItem] = []        # 通知队列
    dialog: Optional[DialogState] = None  # 当前弹窗
```

### 1.3 各页面快照映射

#### Chat 页面（对话）

```
┌─────────────────────────────────────────────────────────┐
│  💬 │ 🔍搜索... │         SiPer         │              │
│ 侧边栏  │  中栏（智能体列表）  │  右栏（聊天内容）        │
│        │                    │                         │
│ ▶default│  ┌──────────────┐ │  ┌─────────────────┐   │
│ ▶影视   │  │ default 7 +  │ │  │ 用户: 你好       │   │
│ ▶市场   │  │ ┌──────────┐ │ │  │ AI: 你好！我是... │   │
│         │  │ │ 会话1    │ │ │  │                  │   │
│ 📋任务  │  │ │ 会话2    │ │ │  │ 🔧 web_search   │   │
│ 🤖模型  │  │ └──────────┘ │ │  │ 📄 result.txt   │   │
│ 🔧工具  │  └──────────────┘ │  │                  │   │
│ 🧩技能  │                    │  │ [输入消息...]     │   │
│ 🔌插件  │                    │  └─────────────────┘   │
│ 📊监控  │                    │                         │
│ ⚙️全局  │                    │                         │
└─────────────────────────────────────────────────────────┘

快照路径：
- current_page = "chat"
- sidebar_expanded = true
- sidebar_search = ""
- agents = [{name: "default", sessions: [...], expanded: true}, ...]
- active_session_id = "abc123"
- chat_header_name = "default"
- messages = [{role: "user", content: "你好"}, {role: "assistant", content: "你好！...", tool_calls: [...]}]
- is_streaming = false
- is_sending = false
```

#### Sessions 页面（会话管理）

```
快照路径：
- current_page = "sessions"
- page_cache.sessions = {
    list: [{sid, agent, last_msg, unread, created_at}, ...],
    preview_sid: "abc123",
    preview_msgs: [{role, content, time}, ...]
  }
```

#### Memory 页面（记忆管理）

```
快照路径：
- current_page = "memory"
- page_cache.memory = {
    agent: "default",
    md_content: "# 记忆\n...",
    config: {mode: "append", max_tokens: 2000, template: "{memory}"},
    preview: "当前配置下，记忆将以..."
  }
```

#### Agent Config 页面（智能体配置）

```
快照路径：
- current_page = "agent-config"
- page_cache.agent_config = {
    agent: "default",
    tab: "about",
    tabs: {
      about: {name: "AI Agent", icon: "🎭", msg_color: "#...", soul: "..."},
      files: {md_content: "...", memory_content: "..."},
      memory: {path: "...", max_tokens: 2000},
      limits: {llm_timeout: 300, max_tokens: 8192, ...},
      models: [{name, provider, base_url, api_key, selected}],
      avatar: {avatar: "...", icon_picker_open: false}
    }
  }
```

#### Monitor 页面（监控）

```
快照路径：
- current_page = "monitor"
- page_cache.monitor = {
    active_tab: "token",
    token: {stats: {...}, chart_data: {...}},
    logs: [{time, level, source, msg}, ...],
    performance: {port, uptime, memory, cpu, db_sizes: {...}},
    directory: "项目目录结构..."
  }
```

#### Settings 页面（全局设置）

```
快照路径：
- current_page = "settings"
- page_cache.settings = {
    active_tab: "general",
    cache: {runtime_params: {...}, meta_config: {...}},
    agents: [{name, icon, model, ...}]
  }
```

### 1.4 快照管理器实现

```python
# siper_web.py 新增

import asyncio
import copy
import json
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Set
from enum import Enum


class DeltaOp(Enum):
    """增量操作类型"""
    REPLACE = "replace"   # 替换某个值
    INSERT = "insert"     # 插入新项
    REMOVE = "remove"     # 删除项
    MOVE = "move"         # 移动项位置


@dataclass
class Delta:
    """单个增量变更"""
    op: DeltaOp
    path: str              # 变更路径，如 "sessions[0].last_message"
    value: Any = None      # 新值
    index: int = None      # 列表操作时的索引
    from_index: int = None # move 操作的源位置
    to_index: int = None   # move 操作的目标位置


@dataclass
class SessionCard:
    """会话列表中的单个会话卡片"""
    session_id: str
    agent_name: str
    agent_icon: str
    last_message: str          # 最后一条消息摘要
    last_time: str             # ISO 格式时间
    unread: bool = False       # 是否有未读消息
    message_count: int = 0     # 消息数量


@dataclass
class MessageCard:
    """聊天区域单条消息"""
    message_id: str
    role: str                  # user | assistant | tool
    content: str
    timestamp: str
    tool_calls: List[Dict] = field(default_factory=list)
    attachments: List[Dict] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


@dataclass
class AgentGroup:
    """中栏智能体分组"""
    name: str
    icon: str
    expanded: bool
    sessions: List[Dict] = field(default_factory=list)  # {sid, last_msg, unread}


class DOMSnapshotManager:
    """
    DOM 快照管理器 — 管理前端页面状态的内存快照

    职责：
    1. 维护前端状态的内存镜像
    2. 计算状态变更的增量（delta）
    3. 将增量推送给所有连接的客户端
    4. 首次连接时发送全量快照
    """

    def __init__(self):
        # 核心快照（单一数据源）
        self._snapshot = self._create_empty_snapshot()

        # 变更历史（用于断线重连时补发）
        self._delta_log: List[Delta] = []
        self._max_delta_log = 1000

        # 快照版本号（单调递增）
        self._version = 0

        # 并发锁
        self._lock = asyncio.Lock()

        # 连接的客户端
        self._clients: Dict[str, 'ClientConnection'] = {}

        # 批量推送控制
        self._pending_deltas: List[Delta] = []
        self._batch_timer: Optional[asyncio.Task] = None
        self._batch_interval = 0.05  # 50ms 批量窗口

    def _create_empty_snapshot(self) -> dict:
        """创建空快照"""
        return {
            "version": 0,
            "timestamp": "",
            "current_page": "chat",
            "sidebar_expanded": True,
            "sidebar_search": "",

            # 会话列表
            "sessions": [],
            "active_session_id": None,

            # 聊天区域
            "chat_header_name": "",
            "messages": [],
            "is_streaming": False,
            "stream_text": "",
            "is_thinking": False,
            "thinking_text": "",
            "is_sending": False,
            "input_text": "",

            # 中栏
            "agents": [],
            "expanded_agents": [],

            # 独立页面缓存
            "page_cache": {},

            # 全局 UI
            "toasts": [],
            "dialog": None,
        }

    # ==================== 快照更新 ====================

    async def update(self, path: str, value: Any):
        """
        更新快照中的某个路径

        示例：
            await mgr.update("is_streaming", True)
            await mgr.update("sessions[0].last_message", "新的消息")
        """
        async with self._lock:
            old_value = self._get_nested(path)
            if old_value == value:
                return  # 无变化，跳过

            self._set_nested(path, value)
            self._version += 1
            self._snapshot["version"] = self._version
            self._snapshot["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S")

            # 生成 delta
            delta = Delta(op=DeltaOp.REPLACE, path=path, value=value)
            await self._record_and_dispatch(delta)

    async def batch_update(self, changes: List[tuple]):
        """
        批量更新快照

        changes: [(path, value), ...]

        示例：
            await mgr.batch_update([
                ("is_streaming", False),
                ("sessions[0].last_message", "完成"),
                ("messages", [...]),
            ])
        """
        async with self._lock:
            deltas = []
            for path, value in changes:
                old_value = self._get_nested(path)
                if old_value == value:
                    continue
                self._set_nested(path, value)
                deltas.append(Delta(op=DeltaOp.REPLACE, path=path, value=value))

            if not deltas:
                return

            self._version += 1
            self._snapshot["version"] = self._version
            self._snapshot["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S")

            for delta in deltas:
                await self._record_and_dispatch(delta)

    async def apply_delta(self, delta: Delta):
        """应用单个 delta 到快照"""
        async with self._lock:
            if delta.op == DeltaOp.REPLACE:
                self._set_nested(delta.path, delta.value)
            elif delta.op == DeltaOp.INSERT:
                self._insert_into_list(delta.path, delta.index, delta.value)
            elif delta.op == DeltaOp.REMOVE:
                self._remove_from_list(delta.path, delta.index)
            elif delta.op == DeltaOp.MOVE:
                self._move_in_list(delta.path, delta.from_index, delta.to_index)

            self._version += 1
            self._snapshot["version"] = self._version

    # ==================== 推送控制 ====================

    async def _record_and_dispatch(self, delta: Delta):
        """记录 delta 并触发推送"""
        # 记录到日志（用于断线重连补发）
        self._delta_log.append(delta)
        if len(self._delta_log) > self._max_delta_log:
            self._delta_log = self._delta_log[-self._max_delta_log:]

        # 加入批量队列
        self._pending_deltas.append(delta)

        # 启动/重置批量定时器
        if self._batch_timer:
            self._batch_timer.cancel()
        self._batch_timer = asyncio.create_task(self._flush_pending())

    async def _flush_pending(self):
        """50ms 后批量推送所有 pending deltas"""
        await asyncio.sleep(self._batch_interval)
        async with self._lock:
            if not self._pending_deltas:
                return
            batch = self._pending_deltas.copy()
            self._pending_deltas.clear()

        # 广播给所有客户端
        await self._broadcast({
            "type": "state_delta",
            "version": self._version,
            "changes": [self._delta_to_dict(d) for d in batch]
        })

    def _delta_to_dict(self, delta: Delta) -> dict:
        """序列化 delta"""
        d = {"op": delta.op.value, "path": delta.path}
        if delta.value is not None:
            d["value"] = delta.value
        if delta.index is not None:
            d["index"] = delta.index
        if delta.from_index is not None:
            d["from"] = delta.from_index
        if delta.to_index is not None:
            d["to"] = delta.to_index
        return d

    # ==================== 全量快照 ====================

    def get_snapshot(self) -> dict:
        """获取当前快照的深拷贝"""
        return copy.deepcopy(self._snapshot)

    def get_snapshot_json(self) -> str:
        """获取快照的 JSON 字符串"""
        return json.dumps(self.get_snapshot(), ensure_ascii=False, default=str)

    # ==================== 客户端管理 ====================

    async def register_client(self, conn_id: str, ws):
        """新客户端连接 — 发送全量快照"""
        self._clients[conn_id] = ws
        # 发送全量快照
        await ws.send(json.dumps({
            "type": "state_full",
            "version": self._version,
            "data": self.get_snapshot()
        }, ensure_ascii=False, default=str))

    async def register_client_with_version(self, conn_id: str, ws, last_version: int):
        """
        客户端带版本号重连 — 只发送缺失的 deltas
        """
        self._clients[conn_id] = ws
        if last_version >= self._version:
            # 客户端已经是最新的
            await ws.send(json.dumps({
                "type": "state_full",
                "version": self._version,
                "data": self.get_snapshot()
            }, ensure_ascii=False, default=str))
        else:
            # 发送缺失的 deltas
            missing = [d for d in self._delta_log
                       if getattr(d, '_version', 0) > last_version]
            if missing:
                await ws.send(json.dumps({
                    "type": "state_deltas",
                    "from_version": last_version,
                    "to_version": self._version,
                    "changes": [self._delta_to_dict(d) for d in missing]
                }, ensure_ascii=False, default=str))
            else:
                # deltas 已过期，发全量
                await ws.send(json.dumps({
                    "type": "state_full",
                    "version": self._version,
                    "data": self.get_snapshot()
                }, ensure_ascii=False, default=str))

    async def unregister_client(self, conn_id: str):
        """客户端断开"""
        self._clients.pop(conn_id, None)

    async def _broadcast(self, message: dict):
        """广播消息给所有客户端"""
        payload = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for conn_id, ws in self._clients.items():
            try:
                await ws.send(payload)
            except Exception:
                dead.append(conn_id)
        for conn_id in dead:
            await self.unregister_client(conn_id)

    # ==================== 嵌套路径操作 ====================

    def _get_nested(self, path: str) -> Any:
        """获取嵌套属性值，路径格式: 'sessions[0].last_message'"""
        parts = self._parse_path(path)
        current = self._snapshot
        for part in parts:
            if isinstance(part, int):
                current = current[part]
            else:
                current = current[part]
        return current

    def _set_nested(self, path: str, value: Any):
        """设置嵌套属性值"""
        parts = self._parse_path(path)
        current = self._snapshot
        for part in parts[:-1]:
            if isinstance(part, int):
                current = current[part]
            else:
                current = current[part]
        last = parts[-1]
        if isinstance(last, int):
            current[last] = value
        else:
            current[last] = value

    def _insert_into_list(self, path: str, index: int, value: Any):
        """向列表插入元素"""
        lst = self._get_nested(path)
        if index is None:
            index = len(lst)
        lst.insert(index, value)

    def _remove_from_list(self, path: str, index: int):
        """从列表删除元素"""
        lst = self._get_nested(path)
        if index is None:
            lst.pop()
        else:
            lst.pop(index)

    def _move_in_list(self, path: str, from_index: int, to_index: int):
        """移动列表元素"""
        lst = self._get_nested(path)
        item = lst.pop(from_index)
        lst.insert(to_index, item)

    def _parse_path(self, path: str) -> list:
        """
        解析路径字符串为 parts 列表
        'sessions[0].last_message' -> ['sessions', 0, 'last_message']
        """
        parts = []
        for segment in path.split('.'):
            if '[' in segment:
                key, idx = segment.split('[')
                parts.append(key)
                parts.append(int(idx.rstrip(']')))
            else:
                parts.append(segment)
        return parts


class ClientConnection:
    """客户端连接封装"""
    def __init__(self, conn_id: str, ws):
        self.conn_id = conn_id
        self.ws = ws
        self.last_version = 0
        self.connected_at = time.time()
```

### 1.5 快照与前端页面的映射关系

```
┌──────────────────────────────────────────────────────┐
│                    前端页面区域                        │
│                                                       │
│  ┌─ 侧边栏 ─────────────────────────────────────────┐ │
│  │  数据源: snapshot.sidebar_expanded                │ │
│  │          snapshot.sidebar_search                  │ │
│  │          snapshot.current_page → 高亮导航项        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 中栏（智能体列表）───────────────────────────────┐ │
│  │  数据源: snapshot.agents[]                        │ │
│  │          snapshot.expanded_agents                 │ │
│  │          snapshot.sidebar_search → 过滤            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 右栏（聊天内容）────────────────────────────────┐  │
│  │  数据源: snapshot.chat_header_name                │ │
│  │          snapshot.messages[]                      │ │
│  │          snapshot.is_streaming                    │ │
│  │          snapshot.stream_text                     │ │
│  │          snapshot.is_thinking                     │ │
│  │          snapshot.is_sending                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 独立页面容器 ───────────────────────────────────┐ │
│  │  数据源: snapshot.current_page → 决定显示哪个页面  │ │
│  │          snapshot.page_cache[page_name]           │ │
│  │                                                   │ │
│  │  ┌─ sessions ──── snapshot.page_cache.sessions   │ │
│  │  ├─ memory ────── snapshot.page_cache.memory      │ │
│  │  ├─ agent-config ─ snapshot.page_cache.agent_cfg  │ │
│  │  ├─ monitor ──── snapshot.page_cache.monitor      │ │
│  │  ├─ skills ───── snapshot.page_cache.skills       │ │
│  │  ├─ token ────── snapshot.page_cache.token        │ │
│  │  ├─ settings ─── snapshot.page_cache.settings     │ │
│  │  └─ theme ────── snapshot.page_cache.theme        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 全局 UI ────────────────────────────────────────┐  │
│  │  数据源: snapshot.toasts[]                        │ │
│  │          snapshot.dialog                          │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## Part 2：前端架构（保持现有样式风格）

### 2.1 前端文件结构

```
webui/
├── index.html              # 页面结构 + 模板（保留现有）
├── css/
│   └── style.css           # 全部样式（保留现有，不改动）
├── js/
│   ├── app.js              # ESM 入口（大幅精简）
│   ├── core.js             # WS 连接 + 状态分发（替代 dom.js）
│   ├── renderer.js         # 纯 DOM 渲染函数（替代 chat.js 中的渲染逻辑）
│   ├── api.js              # HTTP 请求封装（精简）
│   └── components/         # UI 组件（保留现有）
│       ├── toast.js
│       ├── model-test.js
│       └── agent-models.js
│   ├── chat/               # 聊天模块（精简）
│   │   ├── state.js        # 删除 → 状态由后端管理
│   │   ├── stream.js       # 精简 → 只做 DOM 追加
│   │   ├── message.js      # 精简 → 纯渲染
│   │   ├── input.js        # 保留
│   │   ├── sidebar.js      # 精简 → 纯渲染
│   │   ├── lang.js         # 保留
│   │   └── toast.js        # 保留
│   └── pages/              # 独立页面（大幅精简）
│       ├── sessions.js     # 删除 HTTP 逻辑，只保留 DOM 渲染
│       ├── memory.js       # 同上
│       ├── agent-config.js
│       ├── settings.js
│       ├── model-settings.js
│       ├── monitor.js
│       ├── skills.js
│       ├── token.js
│       ├── logs.js
│       └── theme.js
├── static/
│   ├── js/
│   │   ├── echarts.min.js  # 保留
│   │   └── md-render.js     # 保留
│   └── css/
└── api/                    # 新增：API 客户端
    └── client.js           # HTTP API 调用封装
```

### 2.2 前端核心：core.js（替代 dom.js）

```javascript
// core.js — 前端核心（精简版，约 200 行）

import { renderFullSnapshot, applyDelta } from './renderer.js';

let ws = null;
let currentPage = 'chat';
let isConnected = false;

/**
 * 连接 WebSocket
 */
export function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = parseInt(location.port) + 1;
    ws = new WebSocket(`${proto}//${location.hostname}:${wsPort}`);

    ws.onopen = () => {
        isConnected = true;
    };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleWSMessage(msg);
        } catch (err) {
            console.error('[WS] parse error:', err);
        }
    };

    ws.onclose = () => {
        isConnected = false;
        setTimeout(connectWS, 3000);  // 自动重连
    };

    ws.onerror = () => {};
}

/**
 * 处理后端 WS 消息
 */
function handleWSMessage(msg) {
    switch (msg.type) {
        case 'state_full':
            // 全量快照 → 重建整个页面
            renderFullSnapshot(msg.data);
            break;

        case 'state_delta':
            // 增量更新 → 精确更新 DOM
            applyDelta(msg.changes);
            break;

        case 'stream_delta':
            // 流式增量 → 追加文本
            appendStreamText(msg.delta);
            break;

        case 'stream_end':
            // 流式完成 → 完成气泡
            finalizeStream(msg.data);
            break;

        case 'tool_progress':
            // 工具调用进度 → 更新工具卡片
            updateToolProgress(msg);
            break;

        case 'connected':
            // 连接成功
            console.log('[WS] connected:', msg.connection_id);
            break;

        case 'session_created':
            // 新会话创建
            refreshSessionsList();
            break;

        case 'toast':
            // 通知
            showToast(msg.data);
            break;

        default:
            console.warn('[WS] unknown type:', msg.type);
    }
}

/**
 * 发送消息
 */
export function sendMessage(content, options = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'message',
        content: content,
        session_id: options.session_id,
        agent: options.agent,
        model: options.model,
    }));
}

/**
 * 发送停止请求
 */
export function sendStop() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'stop' }));
}

/**
 * 创建新会话
 */
export function createNewSession(agent = 'default') {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'new_session', agent: agent }));
}

/**
 * 导出
 */
export function getWs() { return ws; }
export function getConnected() { return isConnected; }
```

### 2.3 前端渲染器：renderer.js

```javascript
// renderer.js — 纯 DOM 渲染函数（约 300 行）

/**
 * 全量快照渲染 — 首次加载或 WS 重连时调用
 */
export function renderFullSnapshot(snapshot) {
    // 1. 页面路由
    if (snapshot.current_page === 'chat') {
        showChatPage();
        renderChatHeader(snapshot.chat_header_name);
        renderMessages(snapshot.messages);
        renderAgents(snapshot.agents, snapshot.expanded_agents);
        updateSidebarActive(snapshot.current_page);
        updateStreamingState(snapshot.is_streaming, snapshot.stream_text);
        updateThinkingState(snapshot.is_thinking, snapshot.thinking_text);
        updateSendingState(snapshot.is_sending);
    } else {
        showStandalonePage(snapshot.current_page);
        renderStandaloneContent(snapshot.current_page, snapshot.page_cache);
    }

    // 2. 侧边栏状态
    updateSidebarExpanded(snapshot.sidebar_expanded);
    updateSidebarSearch(snapshot.sidebar_search);
}

/**
 * 增量更新 — 运行时精确更新
 */
export function applyDelta(changes) {
    for (const change of changes) {
        switch (change.op) {
            case 'replace':
                applyReplace(change.path, change.value);
                break;
            case 'insert':
                applyInsert(change.path, change.index, change.value);
                break;
            case 'remove':
                applyRemove(change.path, change.index);
                break;
            case 'move':
                applyMove(change.path, change.from, change.to);
                break;
        }
    }
}

/**
 * 替换操作
 */
function applyReplace(path, value) {
    // 路径映射表：snapshot path → DOM 更新函数
    const handlers = {
        'is_streaming': (v) => updateStreamingState(v),
        'stream_text': (v) => updateStreamText(v),
        'is_thinking': (v) => updateThinkingState(v),
        'thinking_text': (v) => updateThinkingText(v),
        'is_sending': (v) => updateSendingState(v),
        'chat_header_name': (v) => updateChatHeader(v),
        'current_page': (v) => switchPage(v),
        'sidebar_expanded': (v) => updateSidebarExpanded(v),
        'sidebar_search': (v) => updateSidebarSearch(v),
        'active_session_id': (v) => updateActiveSession(v),
    };

    // 精确匹配
    if (handlers[path]) {
        handlers[path](value);
        return;
    }

    // 前缀匹配（列表项更新）
    if (path.startsWith('sessions[')) {
        applySessionDelta(path, value);
    } else if (path.startsWith('messages[')) {
        applyMessageDelta(path, value);
    } else if (path.startsWith('page_cache.')) {
        applyPageCacheDelta(path, value);
    } else if (path.startsWith('agents[')) {
        applyAgentDelta(path, value);
    }
}

/**
 * 插入操作
 */
function applyInsert(path, index, value) {
    if (path === 'sessions') {
        insertSessionCard(index, value);
    } else if (path === 'messages') {
        insertMessage(value);
    }
}

/**
 * 删除操作
 */
function applyRemove(path, index) {
    if (path === 'sessions') {
        removeSessionCard(index);
    } else if (path === 'messages') {
        removeMessage(index);
    }
}

/**
 * 移动操作（会话排序）
 */
function applyMove(path, from, to) {
    if (path === 'sessions') {
        moveSessionCard(from, to);
    }
}

// ==================== DOM 更新函数 ====================

function showChatPage() {
    const chatPage = document.getElementById('page-chat');
    const dynamicPage = document.getElementById('page-dynamic');
    if (chatPage) chatPage.style.display = 'flex';
    if (dynamicPage) dynamicPage.style.display = 'none';
}

function showStandalonePage(pageName) {
    const chatPage = document.getElementById('page-chat');
    const dynamicPage = document.getElementById('page-dynamic');
    if (chatPage) chatPage.style.display = 'none';
    if (dynamicPage) {
        dynamicPage.style.display = 'flex';
        renderStandaloneContent(pageName, null);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessages') || document.getElementById('chatContentArea');
    if (!container) return;
    container.innerHTML = '';
    for (const msg of messages) {
        container.appendChild(createMessageElement(msg));
    }
}

function updateStreamingState(isStreaming, text) {
    const input = document.getElementById('chatSendBtn');
    if (input) input.disabled = isStreaming;

    if (isStreaming) {
        // 显示流式输出行
        ensureStreamRow();
        if (text) updateStreamText(text);
    } else {
        // 隐藏流式光标
        const cursor = document.querySelector('.siper-stream-cursor');
        if (cursor) cursor.style.display = 'none';
    }
}

function appendStreamText(delta) {
    const textEl = document.querySelector('.siper-stream-text');
    if (textEl) textEl.textContent += delta;
}

function finalizeStream(data) {
    const streamRow = document.querySelector('.siper-stream-row');
    if (!streamRow) return;

    // 将流式行转为正式消息
    streamRow.classList.remove('siper-stream-row');
    const textEl = streamRow.querySelector('.siper-stream-text');
    if (textEl) textEl.textContent = data.response || '';

    // 渲染工具调用
    if (data.tool_calls && data.tool_calls.length > 0) {
        renderToolCalls(streamRow, data.tool_calls);
    }

    // 重置发送状态
    updateSendingState(false);
}

// ... 更多 DOM 更新函数
```

### 2.4 样式保持策略

**核心原则：CSS 零改动，HTML 结构零改动，只改 JS 逻辑。**

```
保留不动：
├── css/style.css           # 全部样式（1222 行，不动）
├── index.html              # 页面结构和模板（不动）
├── 所有 tpl-* 模板         # 不动
├── 所有 siper-* class      # 不动
├── 所有 CSS 变量           # 不动
└── 所有组件 HTML 结构       # 不动

只改动的：
├── js/app.js               # 从 235 行精简到 ~50 行
├── js/utils/dom.js         # 删除，替换为 js/core.js ~200 行
├── js/pages/chat.js        # 从 1017 行精简到 ~100 行
├── js/chat/state.js        # 删除（状态由后端管理）
├── js/chat/stream.js       # 精简到 ~50 行
└── js/pages/*.js          # 全部精简（删除 HTTP 逻辑，只保留 DOM 渲染）
```

---

## Part 3：实现规划

### 3.1 需要详细规划的内容清单

| # | 规划项 | 复杂度 | 说明 |
|---|--------|--------|------|
| 1 | **DOM 快照数据结构定义** | 中 | 定义完整的 snapshot 结构，与前端页面一一对应 |
| 2 | **增量计算引擎** | 高 | 后端如何高效计算状态差异，生成 delta |
| 3 | **WS 推送协议** | 中 | state_full / state_delta / stream_* 的完整协议 |
| 4 | **前端渲染引擎** | 高 | 全量快照渲染 + 增量 DOM 更新 |
| 5 | **HTTP API 端点** | 中 | 新增 /api/state/snapshot 等端点 |
| 6 | **消息处理流程改造** | 高 | process_message 中集成快照更新 |
| 7 | **页面导航改造** | 低 | navigateToPage 改为请求后端 |
| 8 | **会话管理状态迁移** | 中 | 会话列表/切换/排序移入快照 |
| 9 | **独立页面数据流** | 中 | 各独立页面的数据从 WS 快照获取 |
| 10 | **断线重连策略** | 中 | 版本号对齐 + delta 补发 |
| 11 | **多载体适配器** | 高 | CarrierAdapter 接口 + 各载体实现 |
| 12 | **数据一致性保障** | 高 | 快照版本号 + 并发控制 + 事务性 |
| 13 | **性能优化** | 中 | 批量推送、DOM diff、虚拟滚动 |
| 14 | **迁移策略** | 中 | 从现有架构平滑迁移的步骤 |

### 3.2 分阶段实施计划

#### Phase 0：基础设施（1 周）

**目标**：搭建骨架，不影响现有功能

```
Week 1:
├── Day 1-2: 后端 DOMSnapshotManager 实现
│   ├── 快照数据结构定义
│   ├── 嵌套路径 CRUD
│   ├── 增量计算引擎
│   └── 单元测试
│
├── Day 3: WS 推送协议
│   ├── state_full / state_delta 消息格式
│   ├── 批量推送（50ms 窗口）
│   └── 断线重连 delta 补发
│
├── Day 4: 前端 core.js 基础
│   ├── WS 连接 + 消息分发
│   ├── state_full → renderFullSnapshot
│   └── state_delta → applyDelta
│
├── Day 5: 前端 renderer.js 基础
│   ├── 全量快照渲染（chat 页面）
│   ├── 增量 DOM 更新
│   └── 流式输出集成
│
└── Day 6-7: 联调 + 测试
    ├── 后端快照 → 前端渲染 端到端验证
    ├── 消息发送 → 流式输出 → 完成 全链路
    └── 断线重连测试
```

#### Phase 1：聊天核心迁移（1 周）

**目标**：聊天页面的状态管理移入后端

```
Week 2:
├── 聊天状态迁移
│   ├── is_sending / is_streaming / is_thinking
│   ├── 消息列表
│   ├── 流式文本
│   └── 思考过程
│
├── 会话状态迁移
│   ├── 会话列表（含排序）
│   ├── 活跃会话
│   └── 未读标记
│
├── 中栏状态迁移
│   ├── 智能体分组
│   ├── 展开/折叠
│   └── 搜索过滤
│
└── 集成测试
    ├── 多会话切换
    ├── 新会话创建
    ├── 消息排序
    └── 流式并发
```

#### Phase 2：独立页面迁移（1 周）

**目标**：所有独立页面改为快照驱动

```
Week 3:
├── 页面导航
│   ├── navigateToPage → 请求后端切换页面
│   ├── 后端维护 current_page
│   └── 页面缓存策略
│
├── 各页面数据流
│   ├── sessions → page_cache.sessions
│   ├── memory → page_cache.memory
│   ├── agent-config → page_cache.agent_config
│   ├── monitor → page_cache.monitor
│   ├── skills → page_cache.skills
│   ├── token → page_cache.token
│   ├── settings → page_cache.settings
│   └── theme → page_cache.theme
│
└── 页面缓存管理
    ├── 何时刷新
    ├── 缓存过期策略
    └── 内存控制
```

#### Phase 3：HTTP API + 多载体（1 周）

**目标**：API 层 + 载体适配器

```
Week 4:
├── HTTP API 端点
│   ├── GET /api/state/snapshot
│   ├── GET /api/sessions
│   ├── GET /api/config
│   ├── POST /api/chat (非 WS 备用)
│   └── ... (其他 CRUD)
│
├── CarrierAdapter 接口
│   ├── 接口定义
│   ├── WebUIAdapter (WS)
│   ├── CLIAdapter (终端)
│   └── APIAdapter (HTTP JSON)
│
└── 跨项目通信
    ├── HTTP API 互通
    └── WS Bridge
```

#### Phase 4：优化 + 清理（3 天）

```
├── 性能优化
│   ├── 批量推送调优
│   ├── DOM diff 优化
│   └── 虚拟滚动（长列表）
│
├── 代码清理
│   ├── 删除旧状态管理代码
│   ├── 删除旧 WS 处理逻辑
│   └── 精简 import 链
│
└── 文档 + 测试
    ├── API 文档
    ├── 架构文档
    └── 集成测试
```

### 3.3 关键技术决策点

#### 决策 1：增量 vs 全量

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **全量推送** | 实现简单，无合并逻辑 | 带宽大，延迟高 | 小状态、低频更新 |
| **增量推送** | 带宽小，延迟低 | 合并逻辑复杂，版本控制难 | 大状态、高频更新 |
| **混合** | 兼顾 | 实现复杂度中 | **推荐**：关键状态全量 + 实时数据增量 |

**推荐方案**：
- 页面切换时 → 全量快照（`state_full`）
- 运行时状态变化 → 增量（`state_delta`）
- 流式输出 → 独立通道（`stream_delta`），不走快照

#### 决策 2：前端是否缓存快照

| 方案 | 优点 | 缺点 |
|------|------|------|
| **前端缓存** | 页面切换快，减少请求 | 可能显示过期数据 |
| **后端缓存** | 数据准确 | 每次切换需要请求 |

**推荐方案**：前端缓存 + 版本号校验
- 前端缓存最后一次快照和版本号
- 切换页面时先显示缓存，同时校验版本号
- 版本过期则重新请求全量快照

#### 决策 3：DOM diff 策略

| 方案 | 优点 | 缺点 |
|------|------|------|
| **全量替换 innerHTML** | 实现简单 | 丢失动画、输入焦点 |
| **精确 DOM 更新** | 保留 UI 状态 | 实现复杂 |
| **虚拟 DOM** | 性能优秀 | 引入额外库/复杂度 |

**推荐方案**：精确 DOM 更新
- 通过 path 映射到具体的 DOM 更新函数
- 保留现有 CSS 动画和过渡
- 不引入虚拟 DOM 库

---

## Part 4：风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 后端快照与实际状态不一致 | 前端显示错误数据 | 版本号校验 + 定期全量同步 |
| WS 断线期间状态丢失 | 前端显示过期数据 | 版本号对齐 + delta 补发 |
| 批量推送延迟 | 前端更新不够实时 | 50ms 窗口可调 + 紧急消息立即推送 |
| 快照内存占用过高 | 后端内存压力 | 快照精简 + 过期数据清理 |
| 迁移期间功能退化 | 用户体验下降 | 分阶段迁移 + 每阶段充分测试 |

---

## Part 5：与现有代码的映射关系

### 现有前端状态 → 后端快照路径

| 现有前端变量 | 位置 | 后端快照路径 | 推送方式 |
|-------------|------|-------------|---------|
| `chatSessionId` | state.js | `active_session_id` | state_delta |
| `chatCurrentAgent` | state.js | `agents[active]` | state_delta |
| `isSending` | state.js | `is_sending` | state_delta |
| `_streamAcc` | state.js | `stream_text` | stream_delta |
| `_isThinking` | state.js | `is_thinking` | state_delta |
| `currentPage` | dom.js | `current_page` | state_delta |
| `chatAgents` | state.js | `agents[]` | state_delta |
| `chatExpandedAgents` | state.js | `expanded_agents[]` | state_delta |
| `_logsData` | state.js | `page_cache.monitor.logs` | state_delta |
| `settingsCache` | settings.js | `page_cache.settings.cache` | state_delta |
| `agentConfigData` | agent-config.js | `page_cache.agent_config` | state_delta |
| 会话列表 | sessions.js | `sessions[]` | state_delta |
| 会话消息 | chat.js | `messages[]` | stream_end |

### 现有后端状态 → 保留不变

| 后端组件 | 保留/废弃 | 说明 |
|---------|----------|------|
| `SessionManager` | 保留 | 会话持久化，快照管理器调用它 |
| `ModelsDB` | 保留 | 模型配置持久化 |
| `_token_db_conn` | 保留 | Token 用量持久化 |
| `process_message()` | 保留 | 核心对话逻辑，增加快照回调 |
| `ws_handler` | 改造 | 集成快照推送 |
| HTTP API | 保留 + 扩展 | 新增 /api/state/* 端点 |
