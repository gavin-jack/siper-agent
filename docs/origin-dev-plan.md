# 起源（Origin）开发步骤方案

> 版本：v1.0.0-origin
> 设计时间：2026-07-28
> 代码基线：77a2f92（v0.6.7）
> 总代码量：Python 16102 行 + JS 10415 行 + CSS 4760 行 + HTML 420 行

---

## 开发原则

1. **先后端后前端**：后端快照管理器先行，前端依赖后端推送
2. **增量替换**：每次只改一个模块，保持系统可运行
3. **保持样式零改动**：CSS 和 HTML 不动
4. **每个步骤可测试**：每完成一个步骤，启动服务验证

---

## Phase 0：基础设施（后端核心）

### Step 0.1：创建项目结构

**目标**：新建目录和文件骨架

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
└── ai_agent/db/
    ├── __init__.py
    └── manager.py            # 数据库管理器
```

**验证**：`python -c "from ai_agent.state.snapshot_manager import SnapshotManager"` 无报错

---

### Step 0.2：实现 DOM 快照数据结构

**文件**：`ai_agent/state/dom_snapshot.py`

**内容**：
- `DOMSnapshot` dataclass（约 50 行）
- 包含所有页面状态字段
- `to_dict()` / `from_dict()` 方法

**验证**：
```python
from ai_agent.state.dom_snapshot import DOMSnapshot
s = DOMSnapshot()
assert s.current_page == "chat"
assert s.sidebar_expanded == True
```

---

### Step 0.3：实现 SnapshotManager

**文件**：`ai_agent/state/snapshot_manager.py`

**内容**：
- `SnapshotManager` 类
- `set(path, value)` — 自动更新版本号 + 生成 delta + 入队
- `batch_set(pairs)` — 批量更新
- `insert/remove/move` — 列表操作
- `_enqueue(delta)` — 50ms 批量推送
- `register(conn_id, adapter)` — 新连接发全量
- `register_resumed(conn_id, adapter, last_ver)` — 断线补发
- `get_snapshot()` — 深拷贝快照
- `_resolve(path)` / `_assign(path, value)` — 嵌套路径操作

**约 150 行**

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

---

### Step 0.4：实现推送协议

**文件**：`ai_agent/state/protocol.py`

**内容**：
- 消息类型常量（STATE_FULL, STATE_DELTA, STREAM_DELTA, ...）
- 消息构建函数（`make_state_full()`, `make_state_delta()`, ...）
- 消息解析函数（`parse_ws_message()`）

**约 80 行**

---

### Step 0.5：实现载体适配器

**文件**：`ai_agent/state/carrier.py`

**内容**：
- `CarrierAdapter` 基类（5 个回调）
- `WebUIAdapter` — 通过 WS 推送
- `CLIAdapter` — 终端输出
- `APIAdapter` — 缓存快照
- `CarrierManager` — 管理所有载体连接

**约 120 行**

---

### Step 0.6：实现 HTTP 路由注册器

**文件**：`ai_agent/api/router.py`

**内容**：
- `Router` 类
- `@router.get/post/put/delete` 装饰器
- `dispatch(method, path)` 方法
- 统一响应格式 `ok(data)` / `err(code, message)`

**约 50 行**

---

### Step 0.7：实现数据库管理器

**文件**：`ai_agent/db/manager.py`

**内容**：
- `DatabaseManager` 类
- `conn(name)` — 获取数据库连接（单例）
- `_path(name)` — 数据库路径映射

**约 30 行**

---

### Step 0.8：集成到 siper_web.py（最小化改动）

**文件**：`siper_web.py`

**改动**：
1. 添加 import：`from ai_agent.state.snapshot_manager import SnapshotManager`
2. 在 `main()` 中初始化：`snapshot_mgr = SnapshotManager()`
3. 在 `ws_handler` 开头注册连接：`await snapshot_mgr.register(conn_id, WebUIAdapter(ws))`
4. 在 `ws_handler` 结尾注销连接：`await snapshot_mgr.unregister(conn_id)`
5. 在 HTTP 路由开头添加快照端点：`if path == "/api/v1/state/snapshot": return ok(snapshot_mgr.get_snapshot())`

**改动量**：约 20 行

**验证**：启动服务 → `curl http://localhost:9724/api/v1/state/snapshot` 返回 JSON

---

## Phase 1：前端核心

### Step 1.1：创建 core.js

**文件**：`webui/js/core.js`（新建）

**内容**：
- `connectWS()` — WS 连接 + 消息分发
- `dispatch(msg)` — 根据 msg.type 调用对应处理
- `send(obj)` — 发送 WS 消息
- `nav(page)` — 页面导航

**约 60 行**

---

### Step 1.2：创建 renderer.js

**文件**：`webui/js/renderer.js`（新建）

**内容**：
- `renderFull(snapshot)` — 全量快照渲染
- `applyDelta(changes)` — 增量更新
- `appendStream(delta, sid)` — 流式追加
- `finalizeStream(data)` — 流式完成
- `renderMessages(msgs)` — 消息列表渲染
- `renderAgents(agents)` — 智能体列表渲染
- `renderSessions(list)` — 会话列表渲染
- `renderPageContent(page, cache)` — 独立页面内容渲染
- `highlightSession(sid)` — 会话高亮
- `showChat()` / `showPage(name)` — 页面切换

**约 200 行**

---

### Step 1.3：重写 app.js

**文件**：`webui/js/app.js`

**改动**：
- 删除所有 import（约 20 行 → 3 行）
- 只保留：`import { connectWS } from './core.js'; connectWS();`
- 删除所有 window 挂载
- 删除 initRouter（由 WS state_full 替代）
- 删除所有 keyboard accessibility（移到 core.js）

**从 235 行 → 30 行**

---

### Step 1.4：验证前端骨架

**步骤**：
1. 启动服务
2. 打开浏览器 DevTools Console
3. 确认无 JS 错误
4. 确认 WS 连接成功（Network → WS → 看到 state_full 消息）

---

## Phase 2：聊天核心迁移

### Step 2.1：后端 — 消息处理集成快照

**文件**：`siper_web.py`

**改动**：在 `_process_ws_message` 中：
1. 消息处理开始：`await snapshot_mgr.set("is_sending", True)`
2. 流式 delta：`await snapshot_mgr.set("stream_text", accumulator)`
3. 流式完成：`await snapshot_mgr.batch_set([("is_streaming", False), ("messages", updated)])`
4. 会话列表更新：`await snapshot_mgr.set("sessions", session_list)`
5. 消息处理结束：`await snapshot_mgr.set("is_sending", False)`

**改动量**：约 30 行

---

### Step 2.2：后端 — 会话列表计算

**文件**：新增 `ai_agent/state/session_sync.py`

**内容**：
- `sync_sessions(snapshot_mgr, session_manager)` — 从 DB 加载会话列表，更新快照
- `sync_messages(snapshot_mgr, session_id, messages)` — 更新快照中的消息列表
- `sync_agents(snapshot_mgr)` — 从 agents 目录加载智能体列表

**约 80 行**

---

### Step 2.3：前端 — 聊天消息渲染

**文件**：`webui/js/chat/message.js`

**改动**：
- 保留 `chatRenderMarkdown()`, `chatEscapeHtml()` 等纯函数
- 删除所有 fetch 调用
- 删除 `chatLoadSessionMessages()`（由 WS 推送替代）
- 添加 `renderMessage(msg)` — 从快照数据渲染单条消息
- 添加 `renderToolCalls(container, calls)` — 渲染工具调用卡片

**从 364 行 → 150 行**

---

### Step 2.4：前端 — 输入框适配

**文件**：`webui/js/chat/input.js`

**改动**：
- `chatSendMessage()` 改为调用 `send({type: 'message', content, ...})`
- `renderChatFilePreviews()` 保留（本地预览不需要后端）
- 删除 `loadChatModels()`（改为从快照获取模型列表）
- 添加 `renderModelDropdown(models)` — 从快照数据渲染

**从 430 行 → 200 行**

---

### Step 2.5：前端 — 侧边栏适配

**文件**：`webui/js/chat/sidebar.js`

**改动**：
- 删除 `loadChatAgents()`（改为从快照获取）
- 删除 `chatLoadAllSessions()`（改为从快照获取）
- 保留 `renderMiddleList()` 作为纯渲染函数
- 删除所有 fetch 调用
- `selectChatSession()` 改为调用 `send({type: 'switch_session', session_id})`
- `startNewChat()` 改为调用 `send({type: 'new_session', agent})`
- `deleteChatSessionConfirm()` 改为调用 `send({type: 'delete_session', session_id})`

**从 657 行 → 200 行**

---

### Step 2.6：前端 — 流式处理精简

**文件**：`webui/js/chat/stream.js`

**改动**：
- 删除 `chatHandleStreamDelta()` 和 `chatHandleStreamEnd()`（移到 renderer.js）
- 保留 `_syncStreamFromCurrent()` 等内部辅助函数（如果 core.js 需要）
- 或者直接删除整个文件，流式由 core.js + renderer.js 处理

**从 376 行 → 0 行（删除）**

---

### Step 2.7：前端 — 状态管理删除

**文件**：`webui/js/chat/state.js`

**改动**：删除整个文件。所有状态由后端 SnapshotManager 管理。

**从 220 行 → 0 行（删除）**

---

### Step 2.8：验证聊天核心

**测试流程**：
1. 启动服务 → 打开浏览器
2. 选择智能体 → 发送消息
3. 确认：消息显示 → 流式输出 → AI 回复 → 工具调用卡片
4. 切换会话 → 确认消息历史加载
5. 刷新页面 → 确认状态恢复（WS 重连）

---

## Phase 3：独立页面迁移

### Step 3.1：前端 — 页面导航改造

**文件**：`webui/js/utils/dom.js`

**改动**：
- `navigateToPage()` 改为调用 `nav(page)` 从 core.js
- 删除所有 tplMap / cloneNode / initRouter 逻辑
- 删除所有 `refreshXxx()` 函数（由 WS 推送替代）
- 保留 `escapeHtml()`, `toast()` 等纯工具函数
- 删除 `_sendClarifyResponse()`（改为通过 WS 发送）

**从 1008 行 → 100 行**

---

### Step 3.2：前端 — 会话管理页面

**文件**：`webui/js/pages/sessions.js`

**改动**：
- 删除所有 fetch 调用
- `refreshSessions()` 改为 `renderSessions(list)` 纯渲染
- `switchSession()` 改为 `send({type: 'switch_session', sid})`
- `loadSessionHistory()` 改为 `renderSessionPreview(msgs)` 纯渲染
- `previewSession()` 改为纯渲染

**从 323 行 → 60 行**

---

### Step 3.3：前端 — 记忆管理页面

**文件**：`webui/js/pages/memory.js`

**改动**：
- 删除所有 fetch 调用
- `refreshMemoryPage()` 改为 `renderMemoryContent(md, agent)` 纯渲染
- `saveMemoryMd()` 改为 `send({type: 'save_memory', content})`
- `saveMemoryConfig()` 改为 `send({type: 'save_memory_config', config})`
- `populateMemoryAgentSelector()` 改为从快照获取

**从 158 行 → 50 行**

---

### Step 3.4：前端 — 智能体配置页面

**文件**：`webui/js/pages/agent-config.js`

**改动**：
- 删除所有 fetch 调用（22 处）
- `loadAgentSettings()` 改为 `renderAgentConfig(data)` 纯渲染
- `saveAgentSettings()` 改为 `send({type: 'save_agent_settings', data})`
- `refreshConfigAgentPanel()` 改为纯渲染
- `selectConfigAgent()` 改为 `send({type: 'switch_agent', name})`
- `triggerAgentAutoSave()` 改为 `send({type: 'auto_agent_save', field, value})`
- 保留表单 UI 交互逻辑（Tab 切换、图标选择器）

**从 770 行 → 200 行**

---

### Step 3.5：前端 — 全局设置页面

**文件**：`webui/js/pages/settings.js`

**改动**：
- 删除所有 fetch 调用（7 处）
- `refreshGlobalSettings()` 改为纯渲染
- `renderGlobalAgents()` 改为纯渲染
- `confirmDeleteGlobalAgent()` 改为 `send({type: 'delete_agent', name})`

**从 377 行 → 80 行**

---

### Step 3.6：前端 — 模型管理页面

**文件**：`webui/js/pages/model-settings.js`

**改动**：
- 删除所有 fetch 调用（6 处）
- `loadSettingsModels()` 改为纯渲染
- `discoverModels()` 改为 `send({type: 'discover_models', provider, base_url, api_key})`
- `addDiscoveredModel()` 改为 `send({type: 'add_model', model})`
- 保留搜索/排序/筛选 UI 交互（纯前端操作，不需要后端）

**从 1032 行 → 250 行**

---

### Step 3.7：前端 — 主题设置页面

**文件**：`webui/js/pages/theme.js`

**改动**：
- 删除所有 fetch 调用
- `showThemeSettings()` 改为纯渲染
- `saveThemeTemplate()` 改为 `send({type: 'save_theme', data})`
- `resetTheme()` 改为 `send({type: 'reset_theme'})`
- 保留颜色选择器/滑块 UI 交互

**从 283 行 → 100 行**

---

### Step 3.8：前端 — 技能管理页面

**文件**：`webui/js/pages/skills.js`

**改动**：
- 删除 fetch 调用（2 处）
- `refreshSkills()` 改为纯渲染
- `previewSkillFilter()` 改为 `send({type: 'preview_skill', input})`

**从 90 行 → 40 行**

---

### Step 3.9：前端 — Token 用量页面

**文件**：`webui/js/pages/token.js`

**改动**：
- 删除 fetch 调用（1 处）
- `refreshTokenStats()` 改为纯渲染
- 保留 ECharts 图表渲染逻辑

**从 355 行 → 100 行**

---

### Step 3.10：前端 — 日志页面

**文件**：`webui/js/pages/logs.js`

**改动**：
- 删除 fetch 调用（1 处）
- `refreshLogs()` 改为纯渲染
- 保留筛选/分页 UI 交互

**从 198 行 → 60 行**

---

### Step 3.11：前端 — 通知组件保留

**文件**：`webui/js/components/toast.js`

**改动**：
- 保留全部逻辑（655 行）
- 添加 `showToast(data)` 入口函数（从 WS toast 消息调用）
- 添加 `showDialog(data)` 入口函数（从 WS dialog 消息调用）

**从 655 行 → 660 行（微增）**

---

## Phase 4：后端 API 重构

### Step 4.1：迁移 HTTP API 到 Router

**文件**：`siper_web.py`

**改动**：
- 将 `handle_request` 中的 50+ if/elif 路由
- 迁移到 `ai_agent/api/router.py` + `ai_agent/api/handlers.py`
- `handle_request` 改为调用 `router.dispatch(method, path)`

**改动量**：siper_web.py -300 行，handlers.py +400 行

---

### Step 4.2：添加状态同步函数

**文件**：新增 `ai_agent/state/session_sync.py`

**内容**：
- `sync_sessions()` — 从 DB 加载会话列表 → 更新快照
- `sync_messages()` — 加载会话消息 → 更新快照
- `sync_agents()` — 加载智能体列表 → 更新快照
- `sync_monitor()` — 加载监控数据 → 更新快照
- `sync_skills()` — 加载技能列表 → 更新快照

**约 150 行**

---

### Step 4.3：集成所有状态同步

**文件**：`siper_web.py`

**改动**：
- 在 `main()` 启动时调用 `sync_all()`
- 在消息处理完成后调用 `sync_sessions()`, `sync_messages()`
- 在配置变更后调用对应 sync 函数
- 定时调用 `sync_monitor()`（每 30 秒）

---

## Phase 5：清理与优化

### Step 5.1：删除废弃文件

```
删除：
├── webui/js/chat/state.js      # 状态由后端管理
├── webui/js/chat/stream.js     # 流式由 core.js 处理
└── webui/js/utils/dom.js       # 由 core.js + renderer.js 替代
```

### Step 5.2：清理 app.js 残留

**文件**：`webui/js/app.js`

**最终内容**（约 15 行）：
```javascript
import { connectWS } from './core.js';
connectWS();
```

### Step 5.3：清理 chat.js 残留

**文件**：`webui/js/pages/chat.js`

**最终内容**：
- 删除所有被迁移到新文件的函数
- 只保留未迁移的渲染辅助函数（如果有）

---

## 文件改动汇总

### 新建文件（8 个）

| 文件 | 行数 | 说明 |
|------|------|------|
| ai_agent/state/__init__.py | 5 | 包导出 |
| ai_agent/state/dom_snapshot.py | 50 | 快照数据结构 |
| ai_agent/state/snapshot_manager.py | 150 | 快照管理器 |
| ai_agent/state/protocol.py | 80 | 推送协议 |
| ai_agent/state/carrier.py | 120 | 载体适配器 |
| ai_agent/state/session_sync.py | 80 | 状态同步 |
| ai_agent/api/router.py | 50 | 路由注册器 |
| ai_agent/api/handlers.py | 400 | API 处理函数 |
| ai_agent/db/manager.py | 30 | 数据库管理器 |
| webui/js/core.js | 60 | 前端核心 |
| webui/js/renderer.js | 200 | 统一渲染 |
| **新建总计** | **~1225** | |

### 修改文件（20 个）

| 文件 | 改动 | 方向 |
|------|------|------|
| siper_web.py | +20 -300 | 集成快照 + 路由迁移 |
| app.js | 235 → 15 | 大幅精简 |
| dom.js | 1008 → 100 | 删除业务逻辑 |
| chat.js | 1017 → 100 | 删除业务逻辑 |
| state.js | 220 → 0 | 删除 |
| stream.js | 376 → 0 | 删除 |
| message.js | 364 → 150 | 精简 |
| input.js | 430 → 200 | 精简 |
| sidebar.js | 657 → 200 | 精简 |
| toast.js (components) | 655 → 660 | 微增 |
| sessions.js | 323 → 60 | 精简 |
| memory.js | 158 → 50 | 精简 |
| agent-config.js | 770 → 200 | 精简 |
| settings.js | 377 → 80 | 精简 |
| model-settings.js | 1032 → 250 | 精简 |
| theme.js | 283 → 100 | 精简 |
| skills.js | 90 → 40 | 精简 |
| token.js | 355 → 100 | 精简 |
| logs.js | 198 → 60 | 精简 |
| i18n.js | 不变 | 保留 |
| style.css | 不变 | 保留 |
| index.html | 不变 | 保留 |

### 代码量变化

| 模块 | 当前 | 目标 | 变化 |
|------|------|------|------|
| Python 后端 | 16102 | ~13000 | -3102 |
| JS 前端 | 10415 | ~3500 | -6915 |
| CSS | 4760 | 4760 | 0 |
| HTML | 420 | 420 | 0 |
| **总计** | **31697** | **~21680** | **-10017** |

---

## 验证清单

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
- [ ] 代码无 lint 错误

---

> **文档结束**
>
> 下一步：确认方案后按 Step 0.1 开始实施。
> 每个 Step 完成后提交代码，确保可回滚。
