# SiPer v1.0.0-origin 修复方案 v3

> 制定日期：2026-05-19
> 基于 v2（origin-fix-plan-v2.md）迭代
> 原则：保留优于原方案、基于内存和数据库、代码结构清晰、删除前验证

---

## 一、当前状态审计

### 1.1 已接通的新轨

| 组件 | 状态 | 说明 |
|------|------|------|
| 后端 SnapshotManager | ✅ | 维护前端 DOM 状态镜像 |
| WS state_full 推送 | ✅ | 连接时推送全量快照 |
| WS state_delta 推送 | ✅ | 50ms 批量增量推送 |
| 前端 renderer.js handlers | ✅ | 15 个路径处理器已注册 |
| `agents` → renderAgentList | ✅ | 智能体列表 + 会话数正确渲染 |
| `sessions` → renderChatMessages | ✅ | 消息渲染函数已挂载 |
| Router 路径参数 | ✅ | `/api/sessions/{sid}` 匹配 |
| WS 初始同步 | ✅ | agents + sessions 加载 |

### 1.2 仍在运行的旧轨（需要逐步替换）

| 旧轨代码 | 位置 | 问题 |
|---------|------|------|
| `loadChatAgents()` | sidebar.js:19 | fetch `/api/agents` — 数据已冗余（WS 推送 agents） |
| `chatLoadAllSessions()` | sidebar.js:70 | fetch `/api/sessions` — 数据已冗余（agents 含 sessions） |
| `switchToAgent()` | sidebar.js:274 | fetch POST `/api/agents` — 功能仍需要（切换 agent） |
| `chatLoadSessionMessages()` | message.js:260 | fetch `/api/sessions/{sid}` — 功能仍需要（加载历史消息） |
| `loadAgentsForConfig()` | sidebar.js:596 | fetch `/api/agents` — 设置页需要 |
| `deleteChatSessionConfirm()` | sidebar.js:503 | fetch DELETE — 功能仍需要 |
| `renameChatSession()` | sidebar.js:382 | fetch PUT — 功能仍需要 |
| `loadSettingsModels()` | model-settings.js | fetch — 功能仍需要 |
| `loadSessionHistory()` | session.js:111 | fetch — 旧消息加载 |
| `updateCtxFromStreamEnd()` | stream.js | 消息结束上下文更新 |

### 1.3 关键发现

**旧轨不是全部需要删**。分两类：

**A. 数据获取类（可被新轨替代）**：
- `loadChatAgents()` — WS 已推送 agents
- `chatLoadAllSessions()` — agents 已含 sessions
- `loadAgentsForConfig()` — WS 已推送 agents

**B. 操作类（必须保留，改用 WS 通知 + HTTP 兜底）**：
- `switchToAgent()` — 切换 agent（POST `/api/agents` 仍需要）
- `chatLoadSessionMessages()` — 加载历史消息（WS 推送 messages 后可替代）
- `deleteChatSessionConfirm()` — 删除会话（DELETE `/api/sessions/{sid}`）
- `renameChatSession()` — 重命名（PUT `/api/sessions/{sid}`）
- `loadSettingsModels()` — 模型管理（独立功能）

---

## 二、问题清单（按优先级排序）

### P0 — 功能错误（必须立即修复）

#### P0-1: `switchToAgent()` fetch 路径错误
- **现象**：点击 agent 头部 → `api/agents` POST 404
- **根因**：Router 之前不支持路径参数，已修复。但浏览器缓存旧版 JS
- **状态**：Router 已修复，需确认缓存刷新后正常

#### P0-2: `chatLoadSessionMessages()` 被旧代码调用
- **现象**：`selectChatSession()` 最后调用了 `chatLoadSessionMessages(sessionId)` —— 走 HTTP 加载消息
- **根因**：旧轨消息加载。WS 推送 `messages` 后不需要 HTTP 加载
- **影响**：消息重复加载（WS 推送 + HTTP 加载），浪费带宽

### P1 — 架构不一致（本阶段修复）

#### P1-1: sidebar.js 混用新旧轨
- **现象**：`renderAgentList()` 更新 `chatAgents`，但 `loadChatAgents()` 又用 fetch 覆盖
- **根因**：新轨 `renderAgentList` 和旧轨 `loadChatAgents` 都在运行
- **影响**：数据竞态，渲染闪烁

#### P1-2: `selectChatSession()` 走旧轨消息加载
- **现象**：`setTimeout(() => chatLoadSessionMessages(session.session_id), 50)` — 每次切会话都 HTTP 加载
- **根因**：新轨 `messages` handler 已注册，但旧轨加载仍在
- **影响**：消息重复、延迟

#### P1-3: `startNewChat()` 创建会话后走旧轨加载
- **现象**：`startNewChat()` 发 WS `new_session`，但 `selectChatSession()` 又 HTTP 加载消息
- **根因**：同上

### P2 — 代码结构优化（本阶段修复）

#### P2-1: sidebar.js 687 行，职责过重
- 会话列表 + CRUD + Agent 配置 HTML 模板 + 右键菜单 + 搜索
- 应拆分为：`sidebar.js`（会话列表）+ `agent-config.js`（配置面板，已有）

#### P2-2: state.js 228 行，legacy aliases 过多
- 20+ 个 `_xxx` 变量 + legacy alias — 有些已无消费者

#### P2-3: pages/chat.js 1014 行，thin entry 名不副实
- 实际包含大量页面渲染逻辑（renderChatPage, renderTasksPageChat, renderMonitorPageChat 等）

### P3 — 废弃代码清理（谨慎删除）

#### P3-1: `loadChatAgents()` — 旧轨 agent 加载
- 验证：WS `agents` handler → `renderAgentList()` 已替代
- 删除条件：确认 `renderAgentList()` 数据完整（含 sessions）

#### P3-2: `chatLoadAllSessions()` — 旧轨会话列表加载
- 验证：agents 数据已含 sessions
- 删除条件：确认 `renderAgentList()` 会话数据完整

#### P3-3: `loadAgentsForConfig()` — 设置页 agent 加载
- 验证：WS `agents` handler → `renderAgentList()` 已加载 agents 数据
- 删除条件：设置页能正常从 `chatAgents` 获取数据

---

## 三、修复策略

### 核心原则：**数据走新轨，操作走 HTTP，删除走验证**

```
数据获取（加载列表） → 新轨 WS 推送替代
操作（增删改）       → HTTP API 保留，加 WS 通知
删除代码            → grep 验证无引用后删除
```

### 3.1 阶段划分

```
Phase 1: 消除旧轨数据获取（P0 + P1）
  → 移除 loadChatAgents / chatLoadAllSessions / loadAgentsForConfig
  → selectChatSession 不再 HTTP 加载消息（WS messages 推送替代）
  → 保留操作类 HTTP（switch/delete/rename）

Phase 2: 代码结构优化（P2）
  → sidebar.js 拆分 agent 配置 HTML 到 agent-config.js
  → state.js 清理无消费者的 legacy aliases
  → pages/chat.js 瘦身（页面渲染移入各 page-*.js）

Phase 3: 废弃代码删除（P3）
  → grep 验证无引用
  → 备份后删除
  → 服务重启验证
```

---

## 四、Phase 1 详细计划

### Step 1.1: 移除旧轨 `loadChatAgents()` 和 `chatLoadAllSessions()`

**当前**：
- `loadChatAgents()` (sidebar.js:19-68) — fetch `/api/agents` + `/api/sessions`
- `chatLoadAllSessions()` (sidebar.js:70-94) — fetch `/api/sessions`

**改为**：
- 删除这两个函数
- `renderAgentList()` 已有 WS 推送数据，直接渲染
- 后端 WS 已推送 agents（含 sessions），无需 HTTP 加载

**影响分析**：
- `loadChatAgents()` 被谁在调用？
  - `app.js` 中无直接调用（通过 `import * as Sidebar`）
  - `selectChatAgent()` (sidebar.js:62) 调用 `loadChatAgents()` — 需要移除
  - `switchToAgent()` (sidebar.js:294) 调用 `loadChatAgents()` — 需要移除

**替换方案**：
```javascript
// 旧：switchToAgent 中
await new Promise(r => setTimeout(r, 100));
loadChatAgents();

// 新：等待 WS 推送 agents（已在 renderAgentList 中自动渲染）
await new Promise(r => setTimeout(r, 100));
// 不需要额外操作，WS 推送已更新 chatAgents
```

### Step 1.2: `selectChatSession()` 移除 HTTP 消息加载

**当前**：
```javascript
// sidebar.js:379
setTimeout(() => { chatLoadSessionMessages(session.session_id); }, 50);
```

**改为**：
- 删除这行
- WS `messages` 推送时，`renderChatMessages()` 自动渲染
- 后端收到 `switch_session` 后推送 `messages` 快照

**风险**：如果 WS `messages` 推送延迟，用户可能看到空消息列表
**缓解**：保留 HTTP 加载作为兜底，但只在 `messages` 快照未到达时触发
```javascript
// 兜底：300ms 后如果消息列表仍为空，HTTP 加载
const _msgTimeout = setTimeout(() => {
  if (document.querySelectorAll('.siper-msg-row').length === 0) {
    chatLoadSessionMessages(session.session_id);
  }
}, 300);
```

### Step 1.3: `loadAgentsForConfig()` 改为从 `chatAgents` 读取

**当前**：
```javascript
// sidebar.js:596-618
function loadAgentsForConfig() {
  fetch('/api/agents')
    .then(r => r.json())
    .then(data => { ... });
}
```

**改为**：
```javascript
function loadAgentsForConfig() {
  if (chatAgents.length > 0) {
    // 从已有数据渲染
    _renderConfigFromCache(chatAgents);
  } else {
    // 数据尚未到达，等待 WS 推送
    // 或 fallback 到 fetch
    fetch('/api/agents').then(r => r.json()).then(data => {
      setChatAgents(data.agents || []);
      _renderConfigFromCache(data.agents || []);
    });
  }
}
```

### Step 1.4: 后端 `switch_session` 消息处理确认

**当前**：后端收到 `switch_session` 后需要加载消息并推送 `messages` 快照

**验证**：
1. 检查 siper_web.py 中 `switch_session` 消息处理
2. 确认后端加载 session messages 后调用 `snapshot_mgr.set("messages", messages)`

---

## 五、Phase 2 详细计划

### Step 2.1: sidebar.js 拆分

**当前**：687 行
**目标**：< 300 行

**拆分方案**：
```
chat/sidebar.js           — 会话列表 + 搜索 + 右键菜单（~250行）
pages/agent-config.js     — 智能体配置面板（已有，移入配置 HTML 模板）
```

**需要移动的代码**：
- `_agentConfigHtmlTemplate` 常量 → agent-config.js
- `renderAgentPage()` → agent-config.js
- `selectChatAgent()` → agent-config.js
- `loadAgentsForConfig()` → agent-config.js
- 相关的全局变量（`_agentConfigInjected`, `_agentAutoSaveBound`）→ agent-config.js

### Step 2.2: state.js 清理 legacy aliases

**清理规则**：
- grep 每个 alias 的消费者
- 只保留有消费者的 alias
- 删除无消费者的 `_xxx` 变量和 alias

### Step 2.3: pages/chat.js 瘦身

**当前**：1014 行
**目标**：< 200 行

**拆分方案**：
```
pages/chat.js              — 入口 + 页面路由（~50行）
pages/chat-chat.js         — renderChatPage（聊天页渲染）
pages/chat-tasks.js        — renderTasksPageChat
pages/chat-skills.js       — renderSkillsPageChat
pages/chat-monitor.js      — renderMonitorPageChat
pages/chat-settings.js     — renderSettingsPageChat
pages/chat-model-settings.js — renderModelSettingsPageChat
pages/chat-token.js        — renderTokenPageChat
pages/chat-logs.js         — renderLogsPageChat
```

---

## 六、Phase 3 详细计划（谨慎删除）

### 删除验证清单

| 文件/函数 | grep 命令 | 预期引用数 |
|-----------|----------|-----------|
| `loadChatAgents` | grep -rn "loadChatAgents" webui/js/ | 仅 sidebar.js 自身 |
| `chatLoadAllSessions` | grep -rn "chatLoadAllSessions" webui/js/ | 仅 sidebar.js 自身 |
| `loadAgentsForConfig` | grep -rn "loadAgentsForConfig" webui/js/ | 仅 sidebar.js 自身 |
| `function loadSettingsModels` | grep -rn "loadSettingsModels" webui/js/ | 检查 model-settings.js |

### 删除流程

1. **grep 验证**：确认无外部引用
2. **注释而非删除**：先注释掉，保留 1 天
3. **服务重启**：验证功能正常
4. **删除注释**：确认无影响后彻底删除
5. **git commit**：记录删除

---

## 七、保留清单（优于原方案的部分）

| 组件 | 位置 | 保留方式 |
|------|------|---------|
| `_deep_equal` 去重 | `snapshot_manager.py` | 保留 |
| per-session 流式状态 | `chat/stream.js` | 保留 |
| 会话预览实时更新 | `chat/session.js` | 保留 |
| 新消息指示器 | `chat/badge.js` | 保留 |
| 思考面板 | `chat/thinking.js` | 保留 |
| 流式渲染节流 | `chat/stream.js` | 保留 |
| CarrierManager | `carrier.py` | 保留 |
| `register_resumed` | `snapshot_manager.py` | 保留 |
| 前端错误诊断 | `app.js` | 保留 |
| `ensureSessionReady` | `chat/session.js` | 保留 |
| WS 初始同步 | `siper_web.py` | 保留 |
| Router 路径参数 | `ai_agent/api/router.py` | 新增保留 |

---

## 八、执行顺序

```
Phase 1（消除旧轨数据获取）
  → Step 1.1: 移除 loadChatAgents / chatLoadAllSessions
  → Step 1.2: selectChatSession 移除 HTTP 消息加载
  → Step 1.3: loadAgentsForConfig 改为从 chatAgents 读取
  → Step 1.4: 确认后端 switch_session 推送 messages
  → 验证：页面加载 + 会话切换 + agent 切换 全部正常

Phase 2（代码结构优化）
  → Step 2.1: sidebar.js 拆分 agent 配置到 agent-config.js
  → Step 2.2: state.js 清理无消费者 legacy aliases
  → Step 2.3: pages/chat.js 瘦身
  → 验证：所有页面渲染正常 + 控制台无错误

Phase 3（废弃代码删除）
  → grep 验证无引用
  → 注释 → 验证 → 删除
  → 验证：服务正常 + 前端正常
```

---

## 九、风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 删除旧轨后 WS 推送延迟导致空白 | 中 | 保留 HTTP 兜底 300ms |
| sidebar.js 拆分导致 HTML 模板引用断裂 | 中 | agent-config.js 已存在，移动代码即可 |
| state.js 清理 alias 导致 import 失败 | 低 | grep 精确验证每个 alias |
| pages/chat.js 拆分导致页面切换失效 | 中 | 保持 chatSwitchPage 路由逻辑不变 |
| 后端 switch_session 不推送 messages | 高 | 验证后端代码 + 添加兜底 |

---

## 十、预期结果

### Phase 1 完成后

- ✅ 页面加载不再有 fetch `/api/agents` 和 `/api/sessions` 请求
- ✅ 会话切换不再有 HTTP 消息加载请求
- ✅ 所有数据来自 WS 推送
- ✅ 操作类 HTTP（switch/delete/rename）保留
- ✅ 控制台无 ReferenceError

### Phase 2 完成后

- ✅ sidebar.js < 300 行
- ✅ state.js 无冗余 alias
- ✅ pages/chat.js < 200 行
- ✅ 代码职责清晰

### Phase 3 完成后

- ✅ 删除所有无引用代码
- ✅ 前端代码总量减少 30%+
- ✅ 维护成本降低
