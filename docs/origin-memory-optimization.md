# 起源 — DOM 构建方式与内存优化方案

> 版本：v1.0.0-origin
> 设计时间：2026-07-28
> 目标：精确到每个字段的构建方式 + 内存零增长策略

---

## 一、问题分析：当前内存热点

### 1.1 当前代码的内存泄漏点

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

### 1.2 内存增长曲线

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
```

---

## 二、DOM 快照的内存优化设计

### 2.1 核心原则：三层存储 + 按需加载

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

### 2.2 快照数据结构（优化后）

```python
# ai_agent/state/dom_snapshot.py

@dataclass
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

@dataclass
class MessageEntry:
    """消息条目 — 聊天展示用（~1KB）"""
    role: str                 # ~10 字节
    content: str              # 截断到 2000 字符
    timestamp: str            # 19 字节
    meta: dict or None        # 工具调用结果摘要（不含完整输出）

@dataclass
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

---

## 三、每个字段的详细构建方式

### 3.1 会话列表（sessions）

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
    // 只渲染前 20 条（可见区域）
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

---

### 3.2 消息列表（messages）

**数据来源**：SQLite `messages` 表 + 内存 `conversation_history`

**构建时机**：
- 切换会话时：从 DB 加载最近 50 条
- 新消息到达时：追加到列表
- 超过 50 条时：移除最旧的消息（保留 system prompt）

**构建方式**：
```python
# 后端：只保留最近 50 条在快照中
MAX_SNAPSHOT_MESSAGES = 50

def build_messages(session_id):
    # 优先从内存加载
    if session_id in agent.conversation_history:
        msgs = agent.conversation_history[session_id]
    else:
        msgs = db_load_messages(session_id, limit=MAX_SNAPSHOT_MESSAGES)

    # 转换为 MessageEntry
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
    # 只保留工具名 + 状态，不保留完整输出
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
// 消息渲染：只渲染可见区域
const MAX_VISIBLE_MESSAGES = 30;

function renderMessages(msgs) {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    // 只渲染最后 30 条
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
- 超过限制时淘汰最旧的消息

---

### 3.3 流式文本（stream_text）

**构建方式**：
```python
# 后端：实时更新，不累积历史
async def on_stream_delta(delta: str, session_id: str):
    # 直接替换快照中的 stream_text（不追加）
    await snapshot_mgr.set("stream_text", delta)
    # 推送给前端
    await broadcast({"type": "stream_delta", "delta": delta, "session_id": session_id})
```

**前端处理**：
```javascript
// 流式文本：直接追加文本节点，不重建 DOM
function appendStream(delta, sid) {
    let row = document.querySelector('.siper-stream-row');
    if (!row) row = createStreamRow(sid);
    const text = row.querySelector('.siper-stream-text');
    if (text) text.textContent += delta;  // 追加文本节点，不重建
}
```

**内存控制**：
- 流式文本在 `stream_end` 后清空
- 后端快照中 `stream_text` 只在流式期间存在
- 前端不缓存流式文本到数组

---

### 3.4 思考过程（thinking_text + thinking_steps）

**构建方式**：
```python
# 后端：实时更新
async def on_thinking_delta(text: str):
    await snapshot_mgr.set("thinking_text", text[-2000:])  # 只保留最后 2000 字符

async def on_thinking_step(step: dict):
    steps = snapshot_mgr.get_snapshot()["thinking_steps"]
    steps.append({"name": step["name"], "status": step["status"]})  # 只保留名称和状态
    await snapshot_mgr.set("thinking_steps", steps[-20:])  # 最多 20 步
```

**内存控制**：
- `thinking_text` 截断到 2000 字符
- `thinking_steps` 最多 20 步
- 思考完成后清空

---

### 3.5 页面缓存（page_cache）

**构建方式**：
```python
# 后端：按需加载 + TTL 淘汰
def get_page_cache(page: str) -> dict:
    cache = snapshot_mgr.get_snapshot()["page_cache"]
    ts = snapshot_mgr.get_snapshot()["_cache_ts"]

    # 检查 TTL
    if page in cache and time.time() - ts.get(page, 0) > 30:
        del cache[page]
        del ts[page]

    if page not in cache:
        cache[page] = build_page_data(page)
        ts[page] = time.time()

    return cache[page]

def build_page_data(page: str) -> dict:
    """按需构建页面数据"""
    if page == "sessions":
        return {"list": build_sessions_list()}
    elif page == "memory":
        return {
            "md_content": load_memory_md()[:5000],  # 截断到 5000 字符
            "config": load_memory_config(),
        }
    elif page == "agent_config":
        return build_agent_config()  # 只加载当前智能体的配置
    elif page == "monitor":
        return build_monitor_data()  # 只加载实时数据
    elif page == "skills":
        return {"list": build_skills_list()}
    elif page == "token":
        return build_token_stats()
    elif page == "settings":
        return build_settings()
    elif page == "theme":
        return build_theme()
    elif page == "model_settings":
        return build_model_settings()
    elif page == "logs":
        return build_logs(page=1, limit=50)  # 只加载第 1 页
    else:
        return {}
```

**TTL 淘汰**：
```python
# 定时清理过期缓存
async def cache_cleanup():
    while True:
        await asyncio.sleep(10)  # 每 10 秒检查一次
        snap = snapshot_mgr.get_snapshot()
        now = time.time()
        expired = [
            p for p, ts in snap["_cache_ts"].items()
            if now - ts > snap["_cache_ttl"]
        ]
        for p in expired:
            del snap["page_cache"][p]
            del snap["_cache_ts"][p]
            snapshot_mgr._cache_bytes -= estimate_size(p)
```

**内存控制**：
- 每个页面缓存 TTL 30 秒
- 总缓存上限 200KB
- LRU 淘汰最久未访问的页面

---

### 3.6 智能体列表（agents）

**构建方式**：
```python
# 后端：从 agents 目录加载（通常 <20 个）
def build_agents_list():
    agents = []
    agents_dir = PROJECT_ROOT / "agents"
    if not agents_dir.exists():
        return agents
    for d in agents_dir.iterdir():
        if not d.is_dir():
            continue
        config = load_agent_config(d.name)
        agents.append({
            "name": d.name,
            "icon": config.get("icon", "🎭"),
            "display_name": config.get("display_name", d.name),
            "model": config.get("model", ""),
            "active_sessions": count_active_sessions(d.name),
        })
    return agents
```

**内存控制**：
- 智能体数量通常 <20，无需截断
- 只在服务启动和智能体变更时重建

---

### 3.7 全局 UI（toasts + dialog）

**构建方式**：
```python
# 后端：toasts 最多 5 条，dialog 最多 1 个
async def add_toast(toast_type, message, duration=3000):
    toasts = snapshot_mgr.get_snapshot()["toasts"]
    toasts.append({"type": toast_type, "message": message[:200], "duration": duration})
    await snapshot_mgr.set("toasts", toasts[-5:])  # 只保留最后 5 条

async def show_dialog(dialog_type, title, content=None):
    await snapshot_mgr.set("dialog", {
        "type": dialog_type,
        "title": title[:100],
        "content": content[:500] if content else None,
    })
```

**前端处理**：
```javascript
// toasts：显示后自动消失，不缓存
function showToast(data) {
    const el = document.createElement('div');
    el.className = `toast toast-${data.type}`;
    el.textContent = data.message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), data.duration || 3000);
}

// dialog：只有一个，关闭后清除
function showDialog(data) {
    // 复用同一个 dialog DOM 元素
    let modal = document.getElementById('globalDialog');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalDialog';
        modal.className = 'dialog-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = renderDialogContent(data);
    modal.style.display = 'flex';
}
```

**内存控制**：
- toasts 最多 5 条，显示后自动从 DOM 移除
- dialog 只有一个，关闭后清除

---

## 四、前端内存优化

### 4.1 DOM 虚拟化（长列表）

**问题**：会话列表可能有几百条，消息列表可能有几十条，全部渲染到 DOM 会占用大量内存。

**方案**：只渲染可见区域 + 少量缓冲

```javascript
// 虚拟列表渲染
class VirtualList {
    constructor(container, itemHeight, renderItem) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.data = [];
        this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 4; // 上下各缓冲 2 条
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
        if (newStart !== this.startIndex) {
            this.startIndex = newStart;
            this.render();
        }
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

**适用场景**：
- 会话列表（可能有几百条）
- 消息列表（可能有几十条）
- 日志列表（可能有几千条）

**内存节省**：
- 会话列表：几百条 → 渲染 20 条（节省 95%）
- 日志列表：几千条 → 渲染 30 条（节省 99%）

### 4.2 流式渲染优化

**问题**：当前每个 stream_delta 都 `renderMarkdown(_streamAcc)` 重建整个气泡 DOM。

**方案**：文本追加 + 节流 Markdown 渲染

```javascript
let _streamAcc = '';
let _streamRenderTimer = null;
let _streamTextEl = null;

function appendStream(delta, sid) {
    if (!_streamTextEl) {
        // 首次：创建 DOM 结构
        const row = document.createElement('div');
        row.className = 'siper-msg-row agent siper-stream-row';
        // ... 创建 avatar + bubble + text element
        _streamTextEl = row.querySelector('.siper-stream-text');
        document.getElementById('chatMessages').appendChild(row);
    }

    // 追加文本（纯文本，不渲染 Markdown）
    _streamTextEl.textContent += delta;
    _streamAcc += delta;

    // 节流 Markdown 渲染：每 200ms 最多渲染一次
    if (!_streamRenderTimer) {
        _streamRenderTimer = setTimeout(() => {
            const bubble = _streamTextEl.closest('.siper-bubble');
            if (bubble) {
                bubble.innerHTML = '';
                bubble.appendChild(renderMarkdown(_streamAcc));
            }
            _streamRenderTimer = null;
        }, 200);
    }
}

function finalizeStream(data) {
    // 最终渲染
    if (_streamRenderTimer) {
        clearTimeout(_streamRenderTimer);
        _streamRenderTimer = null;
    }
    // ... 正常 stream_end 处理
    _streamAcc = '';
    _streamTextEl = null;
}
```

**内存节省**：
- 避免每次 delta 重建 DOM 树
- 节流渲染减少 80% 的 DOM 操作

### 4.3 数据截断策略

| 字段 | 截断长度 | 说明 |
|------|---------|------|
| `sessions[].last_message` | 80 字符 | 列表预览，不需要全文 |
| `messages[].content` | 2000 字符 | 聊天展示，超长内容折叠 |
| `thinking_text` | 2000 字符 | 思考过程，只保留最近部分 |
| `thinking_steps` | 20 步 | 只保留最近的思考步骤 |
| `toasts[].message` | 200 字符 | 通知文本，不需要全文 |
| `dialog.title` | 100 字符 | 弹窗标题 |
| `dialog.content` | 500 字符 | 弹窗内容 |
| `page_cache.memory.md_content` | 5000 字符 | 记忆内容预览 |
| `page_cache.logs` | 50 条 | 只缓存第 1 页日志 |

### 4.4 前端数据清理

```javascript
// 页面切换时清理旧页面 DOM
function switchPage(newPage) {
    // 清理旧页面的所有事件监听器
    const dynamicPage = document.getElementById('page-dynamic');
    if (dynamicPage) {
        // 用 innerHTML 替换（比 removeChild 更快，GC 更彻底）
        dynamicPage.innerHTML = '';
    }

    // 清理消息列表（切换会话时）
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }

    // 清理流式状态
    _streamAcc = '';
    _streamTextEl = null;
    _toolCallSteps = [];
}

// 会话切换时清理消息缓存
function switchSession(newSid) {
    // 清理旧会话的消息 DOM
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';

    // 清理流式状态
    _streamAcc = '';
    _streamTextEl = null;
}
```

---

## 五、后端内存优化

### 5.1 会话历史截断

```python
# agent.py 中
MAX_CONVERSATION_HISTORY = 50  # 最多保留 50 条消息

def add_message(session_id, message):
    history = agent.conversation_history[session_id]
    history.append(message)
    # 超出限制时，保留 system prompt + 最新消息
    if len(history) > MAX_CONVERSATION_HISTORY:
        system = [m for m in history if m.get("role") == "system"]
        recent = history[-(MAX_CONVERSATION_HISTORY - len(system)):]
        agent.conversation_history[session_id] = system + recent
```

### 5.2 快照大小限制

```python
# snapshot_manager.py
MAX_SNAPSHOT_BYTES = 500_000  # 500KB 上限

async def set(self, path, value):
    # 更新前检查大小
    self._assign(path, value)
    size = self._estimate_size()
    if size > MAX_SNAPSHOT_BYTES:
        await self._evict()

async def _evict(self):
    """淘汰策略：先清 page_cache，再截断 messages"""
    snap = self._snap
    # 1. 清空页面缓存
    snap["page_cache"].clear()
    snap["_cache_ts"].clear()
    # 2. 截断消息列表
    if len(snap["messages"]) > 20:
        snap["messages"] = snap["messages"][-20:]
    # 3. 截断会话列表
    if len(snap["sessions"]) > 30:
        snap["sessions"] = snap["sessions"][:30:]

def _estimate_size(self) -> int:
    """估算快照内存大小"""
    return len(json.dumps(self._snap, ensure_ascii=False, default=str))
```

### 5.3 数据库连接池

```python
# db/manager.py
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
        """关闭空闲连接（每天调用一次）"""
        for name, conn in list(self._conns.items()):
            try:
                conn.close()
            except Exception:
                pass
        self._conns.clear()
```

---

## 六、内存监控

### 6.1 后端监控

```python
# 在 snapshot_manager 中添加
import tracemalloc

def get_memory_stats(self) -> dict:
    """获取内存使用统计"""
    current, peak = tracemalloc.get_traced_memory()
    return {
        "snapshot_bytes": self._estimate_size(),
        "snapshot_version": self._version,
        "connected_clients": len(self._clients),
        "page_cache_pages": len(self._snap["page_cache"]),
        "page_cache_bytes": self._cache_bytes,
        "python_current_mb": current / 1024 / 1024,
        "python_peak_mb": peak / 1024 / 1024,
    }
```

### 6.2 前端监控

```javascript
// 在 core.js 中添加
if (performance.memory) {
    setInterval(() => {
        const mem = performance.memory;
        const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
        const totalMB = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
        console.log(`[Memory] ${usedMB}MB / ${totalMB}MB`);
    }, 30000);  // 每 30 秒记录一次
}
```

---

## 七、总结：内存预算

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

对比当前架构：
- 当前：`tokenHistory` 无限增长 + `conversation_history` 无限增长 + 全量 DOM 渲染
- 起源：所有数据都有硬上限，自动淘汰，内存零增长

---

> **文档结束**
>
> 下一步：将此方案合并到 origin-architecture.md 和 origin-dev-plan.md 中。
