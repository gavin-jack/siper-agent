# SiPer v1.0.0-origin 修复方案

> 制定日期：2026-05-19
> 原则：保留优于原方案部分、基于内存和数据库构建、代码结构清晰、删除前验证

---

## 一、问题诊断

### 核心问题：前端双轨并行，新轨（快照驱动）断裂

当前前端存在两套独立的消息处理链路：

| 链路 | 状态 | 说明 |
|------|------|------|
| **旧轨**（fetch + innerHTML） | ✅ 正常工作 | 前端 fetch 获取数据 → innerHTML 模板克隆 → 页面显示 |
| **新轨**（WS + SnapshotManager） | ❌ 断裂 | 后端产生快照数据 → WS 推送到前端 → renderFull/applyDelta → **_handlers 为空** → 什么都不做 |

### 断裂点定位

```
后端 SnapshotManager.set("sessions", data)
  → 产生 delta {op:replace, path:"sessions", value:[...]}
  → WS 推送 state_delta
  → 前端 dispatch(msg) → applyDelta(changes)
  → _handlers["sessions"] → undefined ← 断裂！
  → 没有任何函数处理 sessions 数据
```

### 根因

renderer.js 提供了 `register(path, fn)` 接口，但**从未有任何代码调用它注册 handler**。

---

## 二、修复策略总览

### 2.1 设计原则

1. **保留优于原方案的部分**：`_deep_equal`、per-session 流式状态、会话预览、新消息指示器、思考面板、流式节流优化、CarrierManager、`register_resumed` 智能选择、前端错误诊断、`ensureSessionReady`
2. **起源架构核心**：后端管理状态（内存 + 数据库），前端只做渲染
3. **砍断旧轨**：删除所有 fetch 调用、删除废弃文件（state.js/stream.js/dom.js）
4. **打通新轨**：注册 renderer handlers，让 `_handlers` 不再为空
5. **代码结构清晰**：每个文件职责单一，函数按逻辑分组

### 2.2 修复路径（5 个阶段）

```
Phase A: 前端核心重构（core.js 拆分 + renderer.js 补全 + handlers 注册）
Phase B: 页面精简（删除 fetch，改为纯渲染，保留 UI 交互）
Phase C: 后端精简（handlers.py 精简 + router.py 精简 + siper_web.py 精简）
Phase D: 废弃文件删除（state.js + stream.js + dom.js）
Phase E: 验证（功能回归测试 + 内存监控）
```

---

## 三、Phase A：前端核心重构

### A.1 core.js 拆分 — 从 940 行降至 ~80 行

**当前问题**：core.js 承担 WS 连接 + 消息分发 + 全部状态变量 + 流式处理 + 会话管理 + 思考面板 + 工具进度 + 页面导航 + 新消息指示器 + 未读标记 = 940 行

**拆分方案**：

| 模块 | 职责 | 行数 |
|------|------|------|
| `core.js` | WS 连接 + 消息分发 + toast/dialog 处理 | ~80 |
| `chat/state.js` | 聊天状态变量（chatAgents, chatSessionId 等 ~20 个）+ getter/setter | ~150 |
| `chat/stream.js` | 流式处理（_appendStream, _finalizeStream, per-session 流式状态） | ~120 |
| `chat/nav.js` | 页面导航（siPerNavigate, chatSwitchPage 路由） | ~80 |
| `chat/session.js` | 会话管理（newSession, stopGeneration, sendMessage, updateSessionPreview, markSessionUnread） | ~100 |
| `chat/thinking.js` | 思考面板（chatThinkingShow/Clear/AddToolStep/AddTextRow） | ~80 |
| `chat/badge.js` | 流式徽章 + 新消息指示器 + 未读标记 | ~60 |
| `chat/input.js` | 输入框（保留精简，send → WS） | ~200（不变） |
| `chat/sidebar.js` | 侧边栏（保留精简） | ~200（不变） |
| `chat/message.js` | 消息渲染（保留精简） | ~150（不变） |

**保留优于原方案的部分**：
- `_deep_equal` → 在 snapshot_manager.py 中（后端保留）
- per-session 流式状态（`_streamState` Map）→ 保留在 chat/stream.js
- 会话预览实时更新（`updateSessionPreview`）→ 保留在 chat/session.js
- 新消息指示器（`_showNewMsgIndicator`）→ 保留在 chat/badge.js
- 思考面板（`chatThinkingAddToolStep`）→ 保留在 chat/thinking.js
- 流式渲染节流（每 200ms）→ 保留在 chat/stream.js
- `ensureSessionReady` → 保留在 chat/session.js
- 前端错误诊断（`window.__siper_errors`）→ 保留在 app.js

**core.js 最终结构**（~80 行）：

```javascript
// core.js — WS 连接 + 消息分发
import { renderFull, applyDelta } from './renderer.js';

let ws = null;
let _ver = 0;
let _reconnectTimer = null;

export function connectWS() { /* WS 连接 + 自动重连（保留现有逻辑） */ }
export function send(obj) { /* WS 发送 */ }
export function getWs() { return ws; }
export function isConnected() { return ws?.readyState === WebSocket.OPEN; }

function dispatch(msg) {
    switch (msg.type) {
        case 'state_full':
            _ver = msg.version;
            renderFull(msg.data);
            break;
        case 'state_delta':
            _ver = msg.version;
            applyDelta(msg.changes);
            break;
        case 'state_deltas':
            _ver = msg.to_version;
            applyDelta(msg.changes);
            break;
        case 'stream_delta':
            // 转发给 chat/stream.js
            if (typeof window.__onStreamDelta === 'function') {
                window.__onStreamDelta(msg.delta, msg.session_id);
            }
            break;
        case 'stream_end':
            if (typeof window.__onStreamEnd === 'function') {
                window.__onStreamEnd(msg.data);
            }
            break;
        case 'tool_progress':
            if (typeof window.__onToolProgress === 'function') {
                window.__onToolProgress(msg);
            }
            break;
        case 'toast':
            if (typeof window.showToast === 'function') {
                window.showToast(msg.data);
            }
            break;
        case 'dialog':
            if (typeof window.showDialog === 'function') {
                window.showDialog(msg.data);
            }
            break;
        case 'connected':
            console.log('[SiPer] server connected:', msg.connection_id);
            break;
        case 'session_created':
            console.log('[SiPer] new session:', msg.session_id);
            break;
        case 'error':
            console.error('[SiPer] server error:', msg.message);
            break;
        default:
            break;
    }
}
```

### A.2 renderer.js 补全 — 从 108 行增至 ~200 行

**当前问题**：缺少 `appendStream`、`finalizeStream`、`updateToolCard`，`_handlers` 从未注册

**补全方案**：

```javascript
// renderer.js — 统一 DOM 渲染

const _handlers = {};

export function register(path, fn) { _handlers[path] = fn; }
export function renderFull(s) { /* 保留现有逻辑 */ }
export function applyDelta(changes) { /* 保留现有逻辑 */ }

// ===== 流式处理（从 chat/stream.js 迁入） =====

export function appendStream(delta, sessionId) {
    // 创建流式 DOM 元素（保留 _appendStream 逻辑）
}

export function finalizeStream(data) {
    // 完成流式输出（保留 _finalizeStream 逻辑）
}

export function updateToolCard(msg) {
    // 更新工具卡片状态（保留现有逻辑）
}

// ===== 消息渲染（保留） =====

export function addMsg(content, role, meta) { /* 保留 */ }
export function appendMeta(container, meta, messageId) { /* 保留 */ }
export function debugHighlight(json) { /* 保留 */ }

// ===== 注册所有 handlers =====

export function registerAllHandlers() {
    register('current_page', (v) => {
        if (typeof window.siPerNavigate === 'function') {
            window.siPerNavigate(v, true);
        }
    });
    register('sidebar_expanded', (v) => {
        const sidebar = document.getElementById('chatSidebar');
        if (sidebar) {
            sidebar.classList.toggle('expanded', v);
            sidebar.classList.toggle('collapsed', !v);
        }
    });
    register('sidebar_search', (v) => {
        const inp = document.getElementById('chatSidebarSearch');
        if (inp) inp.value = v || '';
    });
    register('active_session_id', (v) => {
        // 高亮当前会话（保留现有逻辑）
    });
    register('is_streaming', (v) => {
        // 更新流式徽章（保留现有逻辑）
    });
    register('stream_text', (v) => {
        // 流式文本由 appendStream 处理
    });
    register('is_thinking', (v) => {
        if (v) chatThinkingShow();
        else chatThinkingHide();
    });
    register('thinking_text', (v) => {
        chatThinkingAddTextRow(v);
    });
    register('is_sending', (v) => {
        const sb = document.getElementById('chatSendBtn');
        if (sb) sb.disabled = !!v;
        const stb = document.getElementById('chatStopBtn');
        if (stb) stb.classList.toggle('hidden', !v);
    });
    register('sessions', (v) => {
        if (typeof window.renderMiddleList === 'function') {
            window.renderMiddleList();
        }
    });
    register('messages', (v) => {
        if (typeof window.renderChatMessages === 'function') {
            window.renderChatMessages(v);
        }
    });
    register('agents', (v) => {
        if (typeof window.renderAgentList === 'function') {
            window.renderAgentList(v);
        }
    });
    register('thinking_steps', (v) => {
        if (v && v.length > 0) chatThinkingShow();
        // 渲染思考步骤
    });
    register('toasts', (v) => {
        if (v && v.length > 0) {
            const t = v[v.length - 1];
            if (typeof window.showToast === 'function') {
                window.showToast(t);
            }
        }
    });
    register('dialog', (v) => {
        if (v && typeof window.showDialog === 'function') {
            window.showDialog(v);
        }
    });
}
```

### A.3 app.js 精简 — 从 185 行降至 ~30 行

**当前问题**：包含大量 window 全局挂载、hash 路由、错误诊断等

**精简方案**：保留所有 window 挂载（旧代码依赖），但移除 hash 路由逻辑（改为后端快照驱动导航）

```javascript
// app.js — 入口
import { connectWS, registerAllHandlers } from './core.js';

// 保留所有 window 全局挂载（旧代码依赖）
// ... 现有 import + window.xxx = xxx ...

// 注册所有 renderer handlers
registerAllHandlers();

// 连接 WebSocket
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => connectWS());
} else {
    connectWS();
}

// 保留错误诊断（优于原方案）
window.__siper_errors = [];
// ... 现有错误捕获逻辑 ...
```

### A.4 文件结构重组

```
webui/js/
├── core.js           (80行)   WS + 分发 + toast/dialog
├── renderer.js       (200行)  渲染 + handlers 注册
├── app.js            (30行)   入口 + window 挂载
├── api.js            (保留)   HTTP 请求（43行）
├── utils/
│   ├── escape.js     (保留)   escapeHtml
│   └── i18n.js       (保留)   国际化
├── components/
│   ├── toast.js      (保留)   通知
│   ├── model-test.js (保留)   模型测试
│   └── agent-models.js (保留) 智能体模型
├── chat/
│   ├── state.js      (150行)  聊天状态变量 + getter/setter
│   ├── stream.js     (120行)  流式处理
│   ├── nav.js        (80行)   页面导航
│   ├── session.js    (100行)  会话管理
│   ├── thinking.js   (80行)   思考面板
│   ├── badge.js      (60行)   徽章 + 指示器
│   ├── input.js      (保留)   输入框
│   ├── sidebar.js    (保留)   侧边栏
│   ├── message.js    (保留)   消息渲染
│   └── lang.js       (保留)   语言
├── pages/
│   ├── sessions.js   (精简)   会话管理
│   ├── memory.js     (精简)   记忆管理
│   ├── agent-config.js (精简) 智能体配置
│   ├── settings.js   (精简)   全局设置
│   ├── model-settings.js (精简) 模型管理
│   ├── theme.js      (精简)   主题
│   ├── skills.js     (精简)   技能
│   ├── token.js      (精简)   Token
│   └── logs.js       (精简)   日志
```

---

## 四、Phase B：页面精简

### 原则

- 每个页面删除所有 `fetch()` 调用
- 保留 UI 交互逻辑（按钮点击、表单验证、搜索/筛选）
- 数据获取改为：通过 WS 通知 + `window.__getPageCache()` 优先 + HTTP 请求兜底（过渡期）
- 最终目标：页面 = f(后端快照)，不再有 fetch

### B.1 各页面精简要点

| 页面 | 当前 fetch 数 | 精简方案 |
|------|-------------|---------|
| `sessions.js` | 1 | 删除 fetch，改为 WS 通知驱动 |
| `memory.js` | 2 | 删除 fetch，改为 WS 通知驱动 |
| `agent-config.js` | 22 | 删除 22 处 fetch，改为 WS 通知 + 后端快照 |
| `settings.js` | 7 | 删除 fetch，改为 WS 通知驱动 |
| `model-settings.js` | 6 | 删除 fetch，改为 WS 通知驱动 |
| `theme.js` | 0 | 保留（纯前端交互） |
| `skills.js` | 1 | 删除 fetch |
| `token.js` | 1 | 删除 fetch |
| `logs.js` | 0 | 保留（已有 WS 通知） |

### B.2 精简模式（每个页面统一）

```javascript
// 精简前（以 settings.js 为例）：
async function loadSettings() {
    const resp = await fetch('/api/v1/settings');
    const data = await resp.json();
    // ... 渲染 ...
}

// 精简后：
function renderSettings(data) {
    // 纯渲染逻辑（保留 UI 交互）
    // 不再 fetch，数据由后端快照提供
}

// 通过 renderer handler 注册
register('settings', renderSettings);
```

---

## 五、Phase C：后端精简

### C.1 handlers.py 精简 — 从 2430 行降至 ~500 行

**当前问题**：包含旧服务器全部业务逻辑

**精简方案**：

1. 删除所有 `handle_xxx_request` 函数（旧 HTTP 请求处理）
2. 只保留 Router 需要的 ~30 个纯 API 函数（每个 ~5-10 行）
3. 每个函数只：验证参数 → 调用 agent 方法 → 返回 ok(data)

```python
# handlers.py 精简后结构
@router.get("/api/v1/settings")
async def api_get_settings():
    return ok(_get_settings())

@router.post("/api/v1/settings")
async def api_save_settings(body):
    _save_settings(body)
    return ok()

# ... 每个 API 函数 5-10 行 ...
```

### C.2 router.py 精简 — 从 323 行降至 ~60 行

**当前问题**：`register_routes()` 全局函数内联注册 51 条路由

**精简方案**：

```python
# router.py 精简后结构
class Router:
    # ... 保留 Router 类（装饰器 + dispatch）...

api_router = Router(prefix="")

# 路由注册在各 handler 函数上使用 @router.get/.post 装饰器
# 不再使用 register_routes() 全局函数
```

### C.3 siper_web.py 精简 — 从 4175 行降至 ~2500 行

**当前问题**：包含旧 HTTP 请求处理、会话管理、模型管理等

**精简方案**：

1. 删除 `handle_request()` 旧 HTTP 请求处理（改为 Router 分发）
2. 删除所有 `handle_xxx_request` 函数（已迁移到 handlers.py）
3. 只保留：`main()`、`ws_handler`、`_ws_msg_consumer`、`_process_ws_message`、`_handle_binary_upload`
4. 会话管理保留（`new_session`、`stop`、`clarify_response`）
5. 快照集成保留（`register`/`unregister`/`batch_set`）

---

## 六、Phase D：废弃文件删除

### 删除清单（删除前验证无引用）

| 文件 | 引用检查 | 删除方案 |
|------|---------|---------|
| `webui/js/chat/state.js` | 被 sidebar.js 导入 | 先修复 sidebar.js 导入，再删除 |
| `webui/js/chat/stream.js` | 被 chat.js/input.js/message.js 导入 | 先迁移流式处理到 chat/stream.js（新），再删除旧文件 |
| `webui/js/utils/dom.js` (旧) | 被 app.js 导入 | 先确认 app.js 不再需要，再删除 |
| `webui/js/pages/chat.js` 中的旧代码 | 含 fetch + innerHTML | 精简后保留 |

### 删除前验证步骤

1. `grep -rn "from.*state.js\|import.*state.js" webui/js/` → 确认无引用
2. `grep -rn "from.*stream.js\|import.*stream.js" webui/js/` → 确认无引用
3. `grep -rn "from.*dom.js\|import.*dom.js" webui/js/` → 确认无引用
4. 确认后逐一删除

---

## 七、Phase E：验证

### E.1 功能回归测试

| 测试项 | 验证方法 |
|--------|---------|
| 页面加载 | 浏览器打开 → 无 JS 错误 → 智能体列表显示 |
| 发送消息 → 流式输出 | 输入消息 → 流式 delta → 完整回复 |
| 会话切换 | 点击会话列表 → 消息历史正确 |
| 刷新页面 → 状态恢复 | 刷新 → WS 重连 → 快照恢复 |
| 所有侧边栏导航 | 点击每个侧边栏项 → 页面正确切换 |
| 表单操作（保存/删除） | 设置页面保存 → 后端确认 |
| 停止生成 | 点击停止 → 生成中断 |
| 多会话并发 | 打开多个浏览器标签 → 各自独立 |

### E.2 内存监控

| 指标 | 目标 |
|------|------|
| 后端快照内存 | < 500KB |
| 前端 JS 堆 | < 50MB |
| WS 消息频率 | < 50/秒 |
| 页面切换延迟 | < 200ms |

---

## 八、执行顺序

```
Phase A（前端核心重构）
  → A.1 core.js 拆分
  → A.2 renderer.js 补全
  → A.3 app.js 精简
  → A.4 文件结构重组
  → 验证：WS 连接 → state_full → renderFull → handlers 不为空 → 页面正常显示

Phase B（页面精简）
  → B.1 各页面删除 fetch
  → B.2 各页面注册 renderer handler
  → 验证：所有页面正常显示 + 操作正常

Phase C（后端精简）
  → C.1 handlers.py 精简
  → C.2 router.py 精简
  → C.3 siper_web.py 精简
  → 验证：所有 API 正常 + WS 消息正常

Phase D（废弃文件删除）
  → 验证无引用 → 删除
  → 验证：服务正常启动 + 页面正常加载

Phase E（验证）
  → E.1 功能回归测试
  → E.2 内存监控
```

---

## 九、风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| core.js 拆分导致旧代码引用断裂 | 高 | 保留所有导出名，只拆内部实现 |
| 删除 fetch 后页面无数据 | 高 | 先用 WS 通知 + 后端快照兜底 |
| 删除废弃文件导致 import 失败 | 中 | 先 grep 确认无引用 |
| 后端精简导致 API 异常 | 中 | 每个 API 单独测试 |

---

## 十、保留清单（优于原方案的部分）

| 组件 | 位置 | 保留方式 |
|------|------|---------|
| `_deep_equal` 去重 | `snapshot_manager.py` | 保留 |
| per-session 流式状态 | `chat/stream.js` | 保留在新文件 |
| 会话预览实时更新 | `chat/session.js` | 保留在新文件 |
| 新消息指示器 | `chat/badge.js` | 保留在新文件 |
| 思考面板 | `chat/thinking.js` | 保留在新文件 |
| 流式渲染节流 | `chat/stream.js` | 保留在新文件 |
| CarrierManager | `carrier.py` | 保留 |
| `register_resumed` 智能选择 | `snapshot_manager.py` | 保留 |
| 前端错误诊断 | `app.js` | 保留 |
| `ensureSessionReady` | `chat/session.js` | 保留在新文件 |

---

> **文档结束**
> 
> 下一步：确认方案后开始 Phase A 实施。
