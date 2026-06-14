# SiPer v1.0.0-origin 修复方案 v2

> 制定日期：2026-05-19
> 基于原方案 v1（origin-fix-plan.md）迭代，核心变化：**先通后砍**
> 原则：保留优于原方案部分、基于内存和数据库构建、代码结构清晰、删除前验证

---

## 与原方案的核心差异

| 原方案 v1 | 新方案 v2 | 原因 |
|-----------|----------|------|
| Phase A 拆分后直接删 fetch | Phase 1 先接通新轨验证 | 避免数据真空 |
| Phase B 删除 57 处 fetch | Phase 2 逐页面迁移 | 每个页面独立验证 |
| Phase C 后端精简 | Phase 3 后端精简 | 等前端稳定后再动后端 |
| Phase D 删除废弃文件 | Phase 4 清理 | 最后一步，确保无引用 |

---

## Phase 1: 接通新轨（最优先）

### 目标
验证：后端快照 → WS 推送 → 前端 renderFull/applyDelta → 页面正确显示

### 当前断裂点

```
后端 SnapshotManager.set("sessions", data)
  → WS 推送 state_delta
  → 前端 dispatch(msg) → applyDelta(changes)
  → _handlers["sessions"] → undefined ← 断裂！
```

`renderer.js` 的 `_handlers` 从未注册任何 handler。后端推了数据，前端收到但没人处理。

### 修复步骤

#### Step 1.1：注册 renderer handlers（renderer.js）

在 `renderer.js` 中添加 `registerAllHandlers()`，为每种状态路径注册处理函数：

```
需注册的路径（对应后端 SnapshotManager 的 key）：
  agents              → renderAgentList(agents)
  sessions            → renderMiddleList(sessions)
  messages            → renderChatMessages(messages)
  current_page        → siPerNavigate(page)
  sidebar_expanded    → toggleSidebar(v)
  sidebar_search      → 更新搜索框值
  is_streaming        → 更新流式徽章
  is_thinking        → 思考面板 show/hide
  thinking_steps      → 思考步骤面板
  is_sending          → 发送按钮状态
  active_session_id   → 高亮当前会话
  thinking_text       → 思考文本
```

**关键**：这些 handler 调用的是**已存在的 window 全局函数**（如 `window.renderAgentList`），不是新代码。

#### Step 1.2：验证 _handlers 不为空

```javascript
// 浏览器控制台验证
import('/js/renderer.js').then(m => {
  m.registerAllHandlers();
  console.log('handlers registered');
});
// 然后触发一次后端状态变更，观察页面是否更新
```

#### Step 1.3：验证全链路

1. 启动服务 → 浏览器打开页面
2. 观察 WS 连接日志：`[SiPer] WS connected`
3. 后端产生状态变更（如创建会话）
4. 观察 WS 消息：`state_delta` 到达前端
5. 验证页面是否自动更新（会话列表是否出现新会话）

### 验证标准

| 检查项 | 方法 | 期望 |
|--------|------|------|
| _handlers 不为空 | `Object.keys(_handlers).length > 0` | ≥ 10 |
| state_full 首次渲染 | 打开页面 | 智能体列表显示 |
| state_delta 增量更新 | 创建新会话 | 会话列表自动更新 |
| stream_delta 流式输出 | 发送消息 | 流式文本显示 |
| tool_progress 工具进度 | agent 执行工具 | 工具进度更新 |

---

## Phase 2: 页面迁移（逐页面切换）

### 目标
每个页面从"fetch 获取数据 → innerHTML 渲染"改为"后端快照 → 纯渲染"

### 迁移顺序（按依赖关系）

```
2.1 sessions.js    ← 最简单，只有 1 处 fetch
2.2 memory.js      ← 简单，2 处 fetch
2.3 token.js       ← 简单，1 处 fetch
2.4 skills.js      ← 简单，1 处 fetch
2.5 settings.js    ← 中等，7 处 fetch
2.6 model-settings.js ← 中等，6 处 fetch
2.7 agent-config.js ← 复杂，22 处 fetch
2.8 logs.js        ← 保留（已有 WS）
2.9 theme.js       ← 保留（纯前端）
```

### 迁移模式（每个页面统一）

```
迁移前：
  async function loadData() {
    const resp = await fetch('/api/xxx');
    const data = await resp.json();
    // ... innerHTML 渲染 ...
  }

迁移后：
  function renderXXX(data) {
    // 纯渲染逻辑（保留 UI 交互）
    // 不再 fetch，数据由后端快照通过 handler 提供
  }

  // 注册 handler（在 registerAllHandlers 中）
  register('xxx_data', renderXXX);
```

### 每个页面的验证标准

- ✅ 页面加载后内容正确显示（来自后端快照）
- ✅ 后端状态变更后页面自动更新（WS 推送）
- ✅ 用户操作（按钮点击、搜索、筛选）正常
- ✅ 无控制台错误

---

## Phase 3: 后端精简

### 前置条件
Phase 1 + Phase 2 全部完成，前端完全不依赖旧 HTTP 处理。

### 精简内容

#### 3.1 handlers.py（2430 → ~500 行）
- 删除所有 `handle_xxx_request` 函数（旧 HTTP 处理）
- 只保留 Router 需要的纯 API 函数
- 每个函数：验证参数 → 调用 agent 方法 → 返回 ok(data)

#### 3.2 router.py（323 → ~60 行）
- 删除 `register_routes()` 全局函数
- 路由注册改用装饰器（在 handler 函数上）

#### 3.3 siper_web.py（4175 → ~2500 行）
- 删除 `handle_request()` 旧 HTTP 请求处理
- 删除所有 `handle_xxx_request` 函数
- 只保留：main()、ws_handler、_msg_consumer、_process_ws_message

### 验证标准
- ✅ 所有 API 正常（curl 测试）
- ✅ WS 消息正常
- ✅ 前端所有页面正常

---

## Phase 4: 清理废弃代码

### 删除清单（删除前 grep 验证无引用）

| 文件 | 引用检查 |
|------|---------|
| `webui/js/chat/state.js`（旧） | `grep -rn "from.*state.js"` |
| `webui/js/chat/stream.js`（旧） | `grep -rn "from.*stream.js"` |
| `webui/js/utils/dom.js`（旧） | `grep -rn "from.*dom.js"` |

**注意**：Phase 1 中创建的 `chat/state.js`（新）和 `chat/stream.js`（新）是**不同的文件**，不会被删除。

### 验证标准
- ✅ `grep` 确认无引用
- ✅ 删除后服务正常启动
- ✅ 前端正常加载

---

## 保留清单（优于原方案的部分）

| 组件 | 位置 | 说明 |
|------|------|------|
| `_deep_equal` 去重 | `snapshot_manager.py` | 避免重复推送 |
| per-session 流式状态 | `chat/stream.js` | 多会话独立流式 |
| 会话预览实时更新 | `chat/session.js` | 用户体验 |
| 新消息指示器 | `chat/badge.js` | 未读提示 |
| 思考面板 | `chat/thinking.js` | agent 思考过程 |
| 流式渲染节流 | `chat/stream.js` | 性能优化 |
| CarrierManager | `carrier.py` | 多载体适配 |
| `register_resumed` | `snapshot_manager.py` | 智能选择 |
| 前端错误诊断 | `app.js` | `window.__siper_errors` |
| `ensureSessionReady` | `chat/session.js` | 会话就绪检测 |

---

## 执行顺序

```
Phase 1（接通新轨）
  → Step 1.1: 注册 renderer handlers
  → Step 1.2: 验证 handlers 不为空
  → Step 1.3: 验证全链路（WS → 页面更新）
  → ✅ 验收：智能体列表、会话列表、消息显示全部由后端快照驱动

Phase 2（页面迁移）
  → 逐页面迁移（sessions → memory → token → skills → settings → model-settings → agent-config）
  → 每个页面迁移后立即验证
  → ✅ 验收：所有页面无 fetch，数据来自后端快照

Phase 3（后端精简）
  → handlers.py 精简
  → router.py 精简
  → siper_web.py 精简
  → ✅ 验收：API + WS 全部正常

Phase 4（清理废弃代码）
  → grep 验证无引用
  → 删除废弃文件
  → ✅ 验收：服务正常 + 前端正常

Phase 5（最终验证）
  → 功能回归测试（8 项）
  → 内存监控
  → ✅ 验收：全部通过
```

---

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| handlers 注册后页面不更新 | 高 | 先验证 _handlers 不为空，再验证 WS 消息到达 |
| 页面迁移后数据不显示 | 高 | 保留 fetch 作为兜底，确认新轨工作后再删 fetch |
| 后端精简导致 API 异常 | 中 | 每个 API 用 curl 单独测试 |
| 删除文件导致 import 失败 | 中 | grep 确认 + 服务重启验证 |
