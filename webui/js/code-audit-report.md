# SiPer WebUI JavaScript 代码审计报告

**审计范围**: `E:/siper/webui/js/` 全部 42 个 JS 文件  
**审计日期**: 2026-07-09  

---

## 📊 问题统计总览

| 严重程度 | 数量 |
|---------|-----|
| 🔴 严重 (Critical) | 8 |
| 🟠 高 (High) | 12 |
| 🟡 中 (Medium) | 15 |
| 🟢 低 (Low) | 10 |

| 问题类型 | 数量 |
|---------|-----|
| 重复代码 | 14 |
| 过长函数 | 6 |
| 魔法数字/字符串 | 8 |
| 职责不清 | 5 |
| 死代码 | 4 |
| 性能反模式 | 4 |
| 过度嵌套/复杂条件 | 5 |
| 不一致模式 | 6 |

---

## 🔴 严重问题 (Critical)

### C1. 文件图标映射三处重复定义

**位置**: 
- `utils/file-icon.js` (FILE_ICONS)
- `chat/input.js` (_extIconMap + _otherExtBadge)
- `chat-pages/directory.js` (FILE_ICONS)

**问题类型**: 重复代码 — 三个文件中定义了几乎相同的文件扩展名→emoji 映射，input.js 的版本最详细但与 file-icon.js 并存

**严重程度**: 🔴 严重 — 同一映射维护三处，任何修改都需要三处同步

**修复方案**: 统一使用 `utils/file-icon.js`，从该文件 import

```javascript
// ❌ 修复前 (chat/input.js 154-200行)
const _extIconMap = {
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️', svg: '🖼️', ico: '🖼️',
  pdf: '📕', doc: '📘', docx: '📘', // ... 100+ 行重复映射
};
const _otherExtBadge = { exe: '⚡', msi: '⚡', torrent: '🔗', url: '🔗', lnk: '🔗', ttf: '🔤', otf: '🔤' };
function _getFileIcon(name, category) {
  const ext = (name.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
  return _extIconMap[ext] || _otherExtBadge[ext] || _catFallback[category] || _catFallback.other;
}

// ✅ 修复后
import { getFileIcon } from '../utils/file-icon.js?v=1783612457431';
// 删除 _extIconMap, _otherExtBadge, _getFileIcon, _catFallback
```

---

### C2. 能力标签/图标映射三处重复定义

**位置**:
- `utils/capabilities.js` (CAP_ICONS, CAP_LABELS, CAP_LABELS_PLAIN, CAP_ORDER)
- `pages/chat-pages/model-settings.js` (CAP_ICONS, CAP_LABELS, CAP_ORDER)
- `components/agent-models.js` (import CAP_ORDER 但自己内联了排序逻辑)

**问题类型**: 重复代码 — model-settings.js 完全复制了 capabilities.js 的常量

**严重程度**: 🔴 严重 — 能力类型增减时需要修改多处

**修复方案**:

```javascript
// ❌ 修复前 (model-settings.js 16-18行)
var CAP_ICONS = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', function_calling: '🔧', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏' };
var CAP_LABELS = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', function_calling: '工具', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文' };
var CAP_ORDER = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };

// ✅ 修复后
import { CAP_ICONS, CAP_LABELS, CAP_ORDER } from '../../utils/capabilities.js?v=1783612457431';
```

---

### C3. 文件上传/预览逻辑两处重复

**位置**:
- `chat/input.js` (paste/drag-drop 事件处理 + handleChatFileSelect + getChatFileCategory)
- `chat/input.js` 的 `_ensureChatInput()` 函数内又重复定义了 paste/drag-drop 处理

**问题类型**: 重复代码 — 同一文件中粘贴/拖拽处理逻辑重复两处（35-90行 vs 595-617行）

**严重程度**: 🔴 严重 — 同一文件内存在完全相同逻辑的两份实现

**修复方案**:

```javascript
// ❌ 修复前: _ensureChatInput() 中重复定义了 paste/drag-drop (63-90行)
textarea.addEventListener('paste', function (e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function (ev) { chatPendingFiles.push({ data: ev.target.result, mime: item.type, name: 'pasted-image', category: 'image' }); renderChatFilePreviews(); };
      reader.readAsDataURL(file);
      break;
    }
  }
});

// ✅ 修复后: 提取为共享函数
function _handleFileInput(items, source) {
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function (ev) {
        chatPendingFiles.push({ data: ev.target.result, mime: item.type, name: source === 'paste' ? 'pasted-image' : file.name, category: 'image' });
        renderChatFilePreviews();
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}
// 两处都调用 _handleFileInput
```

---

### C4. 会话切换逻辑过于复杂 (selectChatSession 140行)

**位置**: `chat/sidebar.js` 329-439行

**问题类型**: 过长函数 + 职责不清 — 一个函数处理了会话切换、DOM缓存恢复、思考面板恢复、消息加载、滚动恢复等至少6个职责

**严重程度**: 🔴 严重 — 140行函数，修改任何一处都可能影响其他功能

**修复方案**:

```javascript
// ❌ 修复前: 一个函数做了所有事情
export function selectChatSession(session, agent) {
  // 1. 重置发送状态 (5行)
  // 2. 清除思考状态 (3行)
  // 3. 保存当前DOM缓存 (5行)
  // 4. 设置新会话ID (10行)
  // 5. 更新中栏active class (8行)
  // 6. 切换到chat页面 (5行)
  // 7. 渲染右栏 (5行)
  // 8. 恢复输入框 (3行)
  // 9. 恢复思考面板 (15行)
  // 10. 恢复DOM缓存或HTTP加载消息 (30行)
  // ... 共140行
}

// ✅ 修复后: 拆分为职责清晰的子函数
export async function selectChatSession(session, agent) {
  const prevSid = _chatSessionId;
  
  _prepareForSessionSwitch();
  _saveCurrentSessionState(prevSid);
  _updateSessionContext(session, agent);
  _updateMiddleListActiveState(session.session_id, prevSid);
  await _switchToChatPage(session);
  _restoreThinkingPanel(session);
  await _loadSessionMessages(session);
}

function _prepareForSessionSwitch() {
  setIsSending(false);
  setThinkingSteps([]);
  setIsThinking(false);
  if (_chatStreamRow) _chatStreamRow.style.display = 'none';
}

function _saveCurrentSessionState(prevSid) {
  if (prevSid) _saveDomCache(prevSid);
  if (typeof saveInputCache === 'function') saveInputCache();
}

// ... 其他子函数
```

---

### C5. 全局变量污染 — window 对象挂载过多函数

**位置**: 遍布所有文件，最严重的是 `app.js` (40+ 个 window.xxx 赋值)

**问题类型**: 职责不清 + 全局命名空间污染 — 将大量模块内部函数挂载到 window 全局对象

**严重程度**: 🔴 严重 — 命名冲突风险、调试困难、模块边界模糊

**修复方案**:

```javascript
// ❌ 修复前 (app.js 42-64行)
window.escapeHtml = escapeHtml;
window.t = t;
window.applyLang = applyLang;
window.selectLang = selectLang;
window.updateThemePaletteTrigger = updateThemePaletteTrigger;
window.toggleChatSidebar = toggleChatSidebar;
window.toggleThemePalette = toggleThemePalette;
window.apiGet = apiGet;
window.apiPost = apiPost;
// ... 共40+行

// ✅ 修复后: 使用事件委托 + 命名空间
window.SiperAPI = {
  utils: { escapeHtml, t, applyLang, selectLang },
  nav: { toggleChatSidebar, toggleThemePalette, updateThemePaletteTrigger },
  api: { get: apiGet, post: apiPost },
};
// 或者更好的方案：通过模块导入，不暴露到 window
```

---

### C6. 复制消息逻辑三处重复

**位置**:
- `chat/message.js` 358-375行 (copyChatMsg)
- `pages/chat-pages/model-settings.js` 443-461行 (copyModelName)
- `chat/sidebar.js` 557-559行 (copyChatSessionId)

**问题类型**: 重复代码 — 三个地方实现了几乎相同的 clipboard 写入 + toast 逻辑

**严重程度**: 🔴 严重 — clipboard 操作有浏览器兼容性问题，三处实现可能不一致

**修复方案**:

```javascript
// ❌ 修复前: 三个文件各自实现
// message.js
window.copyChatMsg = function(btn) {
  var text = row ? row.dataset.rawText : '';
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(function() { window.toast.success('已复制'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }
};

// ✅ 修复后: 提取到 utils/clipboard.js
export async function copyToClipboard(text, successMsg = '已复制') {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (window.toast?.success) window.toast.success(successMsg);
  } catch(e) {
    if (window.toast?.error) window.toast.error('复制失败');
  }
}
```

---

### C7. 时间格式化函数三处重复

**位置**:
- `utils/format.js` (fmtTime)
- `chat/message.js` (formatMessageTime)
- `chat/sidebar.js` (内联时间格式化)

**问题类型**: 重复代码 — 三种不同的时间格式化实现

**严重程度**: 🔴 严重 — 同一概念三种实现，行为可能不一致

**修复方案**:

```javascript
// ❌ 修复前: message.js 有自己的 formatMessageTime
export function formatMessageTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  if (isNaN(d.getTime())) return '--';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  if (isToday) return h + ':' + mi + ':' + s;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + mo + '-' + day + ' ' + h + ':' + mi + ':' + s;
}

// ✅ 修复后: 统一使用 utils/format.js
import { fmtTime } from '../utils/format.js?v=1783612457431';
// 删除 formatMessageTime，所有调用点改用 fmtTime
// 如果需要秒数支持，扩展 fmtTime 函数
```

---

### C8. 模型验证逻辑大量重复 (verifyGlobalModel vs verifyChatModel)

**位置**: `components/model-test.js` 29-105行 (verifyGlobalModel) vs 108-189行 (verifyChatModel)

**问题类型**: 重复代码 — 两个函数约160行，70%逻辑重复（更新缓存、构建info字符串、显示toast）

**严重程度**: 🔴 严重 — 验证逻辑变更需要两处同步修改

**修复方案**:

```javascript
// ❌ 修复前: verifyGlobalModel 和 verifyChatModel 各约80行，大量重复
// verifyGlobalModel: 更新 allGlobalModels, globalModelsList, settingsModelsCache
// verifyChatModel: 更新 settingsModelsCache, DOM card 更新
// 两者都: 构建 infoParts 数组，显示 toast

// ✅ 修复后: 提取共享逻辑
async function _handleVerifyResult(d, m, options = {}) {
  const { 
    updateGlobalModels = false, 
    updateAgentModels = false,
    cardElement = null,
    toastFn = toast 
  } = options;
  
  if (d.success) {
    const caps = d.capabilities || [];
    // 统一更新能力
    _mergeCapabilities(m, caps, { updateGlobalModels, updateAgentModels });
    // 统一更新测试元数据
    _updateTestMetadata(m, d);
    // 统一构建 info 字符串
    const infoParts = _buildInfoParts(d);
    const capStr = caps.length ? caps.map(c => (CAP_LABELS[c] || c)).join(' · ') : '仅基础对话';
    toastFn.success(`${m.name} 验证通过 (${infoParts.join(' · ')}) — ${capStr}`, 4000);
    // 更新 DOM
    if (cardElement) _updateCardVerifyState(cardElement, m, d);
  } else {
    m._verified = false;
    m._error = d.error || '连接失败';
    toastFn.error(`${m.name} 验证失败：${d.error || '连接失败'}`, 4000);
  }
}
```

---

## 🟠 高优先级问题 (High)

### H1. 魔法数字泛滥

**位置**: 多处

| 文件 | 行号 | 魔法数字 | 含义 |
|------|------|---------|------|
| `chat/input.js` | 112 | `24` | 行高像素 |
| `chat/input.js` | 113 | `10` | 最大行数 |
| `chat/input.js` | 114 | `3` | 默认行数 |
| `chat/stream.js` | 47 | `200` | 逐次渲染阈值 |
| `chat/stream.js` | 47 | `3` | 节流模数 |
| `chat/stream.js` | 47 | `50` | 大delta阈值 |
| `chat/sidebar.js` | 213 | `3` | 显示最大会话数 |
| `chat/sidebar.js` | 101 | `80` | 滚动到底部距离阈值 |
| `chat/thinking.js` | 44 | `80` | 参数字符截断 |
| `chat/thinking.js` | 48 | `100` | 结果字符截断 |
| `chat/thinking.js` | 63 | `6` | 最大思考步骤数 |
| `core.js` | 36 | `3000` | WS重连间隔 |
| `pages/chat-pages/model-settings.js` | 164 | `1000000` | M阈值 |
| `pages/chat-pages/model-settings.js` | 164 | `1000` | K阈值 |

**修复方案**:

```javascript
// ✅ 在文件顶部或单独 config.js 中定义常量
// chat/input.js
const INPUT_CONFIG = {
  LINE_HEIGHT_PX: 24,
  MAX_LINES: 10,
  DEFAULT_LINES: 3,
  MAX_HEIGHT_PX: 24 * 10, // 240
  MIN_HEIGHT_PX: 24 * 3,  // 72
};

// chat/stream.js
const STREAM_CONFIG = {
  RENDER_ALL_UNDER_CHARS: 200,
  THROTTLE_MODULO: 3,
  LARGE_DELTA_CHARS: 50,
  SCROLL_BOTTOM_THRESHOLD_PX: 80,
};

// chat/sidebar.js
const SESSION_CONFIG = {
  SHOW_MAX_PER_AGENT: 3,
  SCROLL_AUTO_FOLLOW_PX: 80,
};

// chat/thinking.js
const THINKING_CONFIG = {
  PARAM_TRUNCATE_CHARS: 80,
  RESULT_TRUNCATE_CHARS: 100,
  MAX_STEPS_VISIBLE: 6,
};

// core.js
const WS_CONFIG {
  RECONNECT_INTERVAL_MS: 3000,
  HEARTBEAT_TIMEOUT_MS: 30000,
};
```

---

### H2. 不一致的错误处理模式

**位置**: 整个代码库

**问题类型**: 不一致模式 — 三种不同的错误处理风格并存

```javascript
// 风格1: try/catch + 静默忽略
try { localStorage.setItem('key', val); } catch(e) {}

// 风格2: try/catch + console.error
catch(e) { console.error('load failed:', e); }

// 风格3: .catch 链
.catch(function(e) { console.error('[module] failed:', e); });

// 风格4: 无错误处理
const d = await r.json(); // 没有检查 r.ok
```

**修复方案**:

```javascript
// ✅ 统一错误处理工具
// utils/error.js
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function safeApiGet(path, timeout = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(path, { signal: ctrl.signal });
    if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('请求超时', 408);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function safeStorageSet(key, val) {
  try { localStorage.setItem(key, val); }
  catch(e) { console.warn(`[storage] ${key} write failed:`, e.message); }
}
```

---

### H3. 模板克隆页面逻辑重复 (tasks.js / plugins.js)

**位置**: `pages/chat-pages/tasks.js` 和 `pages/chat-pages/plugins.js`

**问题类型**: 重复代码 — 两个文件结构完全相同，只有标题和文案不同

```javascript
// ❌ 修复前: tasks.js (8行)
export function renderTasksPageChat(container) {
  container.className = 'siper-content siper-full-content page-tasks';
  container.innerHTML =
    '<div class="page-header"><h3>📋 ' + t('tasks.title') + '</h3></div>' +
    '<div class="page-body"><div class="empty-state">' + t('tasks.comingSoon') + '</div></div>';
}

// plugins.js (8行) — 几乎一模一样
export function renderPluginsPageChat(container) {
  container.className = 'siper-content siper-full-content page-plugins';
  container.innerHTML =
    '<div class="page-header"><h3>🔌 ' + t('plugins.title') + '</h3></div>' +
    '<div class="page-body"><div class="empty-state">' + t('plugins.comingSoon') + '</div></div>';
}

// ✅ 修复后: 提取通用组件
export function renderComingSoonPage(container, { pageClass, icon, titleKey, comingSoonKey }) {
  container.className = `siper-content siper-full-content page-${pageClass}`;
  container.innerHTML =
    `<div class="page-header"><h3>${icon} ${t(titleKey)}</h3></div>` +
    `<div class="page-body"><div class="empty-state">${t(comingSoonKey)}</div></div>`;
}

export const renderTasksPageChat = (c) => renderComingSoonPage(c, {
  pageClass: 'tasks', icon: '📋', titleKey: 'tasks.title', comingSoonKey: 'tasks.comingSoon'
});
export const renderPluginsPageChat = (c) => renderComingSoonPage(c, {
  pageClass: 'plugins', icon: '🔌', titleKey: 'plugins.title', comingSoonKey: 'plugins.comingSoon'
});
```

---

### H4. 日志页面与监控页日志Tab功能重叠

**位置**: `pages/chat-pages/logs.js` 和 `pages/chat-pages/monitor.js` (日志Tab)

**问题类型**: 职责不清 + 重复代码 — 两个地方都有日志查看功能，monitor.js 的日志Tab 和 logs.js 页面功能高度重叠

**修复方案**: 将日志功能提取为共享组件，两处都引用同一套渲染逻辑

---

### H5. 模型设置页面过长 (860行)

**位置**: `pages/chat-pages/model-settings.js`

**问题类型**: 过长函数 — 单文件860行，包含模型列表渲染、搜索筛选、排序、发现模型、验证等过多职责

**修复方案**: 拆分为多个模块：
- `model-settings/list.js` — 模型列表渲染
- `model-settings/filters.js` — 搜索/筛选/排序
- `model-settings/discover.js` — 模型发现
- `model-settings/verify.js` — 验证逻辑
- `model-settings/index.js` — 入口，组合以上模块

---

### H6. 会话管理页面与侧边栏会话功能重叠

**位置**: `pages/sessions.js` 和 `chat/sidebar.js`

**问题类型**: 职责不清 — 两个地方都有会话列表渲染、删除、预览功能

---

### H7. 自动保存逻辑散落多处

**位置**:
- `pages/chat-pages/chat.js` (triggerAgentAutoSave, triggerAgentFileAutoSave)
- `pages/agent-config.js` (triggerAgentAutoSave, triggerAgentFileAutoSave)
- `pages/chat-pages/settings.js` (_attachSettingsAutoSave)
- `pages/chat-pages/model-settings.js` (autoSaveModels)

**问题类型**: 重复代码 + 不一致模式 — 4处不同的自动保存实现，debounce 时间不统一

**修复方案**:

```javascript
// ✅ 提取为共享工具
// utils/autosave.js
export function createAutoSave(saveFn, options = {}) {
  const { delay = 500, key } = options;
  const timers = new Map();
  
  return function(options = {}) {
    const timerKey = key || 'default';
    if (timers.has(timerKey)) clearTimeout(timers.get(timerKey));
    timers.set(timerKey, setTimeout(() => {
      timers.delete(timerKey);
      saveFn(options);
    }, delay));
  };
}

// 使用
const autoSaveAgent = createAutoSave(_saveAgentConfig, { delay: 1000, key: 'agent' });
const autoSaveFiles = createAutoSave(_saveAgentFiles, { delay: 800, key: 'files' });
const autoSaveSettings = createAutoSave(_saveSystemParams, { delay: 500, key: 'settings' });
```

---

### H8. 不一致的 API 请求封装

**位置**: 
- `utils/api.js` (apiGet, apiPost, apiGetCached)
- `components/model-test.js` (testModel — 自己实现 fetch + AbortController)
- `chat/input.js` (chatUploadFiles — 自己实现 fetch)
- 各页面中大量直接 `fetch(...)` 调用

**问题类型**: 不一致模式 — 有统一的 api.js 但很多地方不用

---

### H9. 状态管理分散

**位置**: `chat/state.js` 定义状态，但 `chat/sidebar.js` 也有自己的 `_sessionDomCache`、`_expandedAgents`、`_switchingAgents` 等模块级状态

**问题类型**: 职责不清 — 状态散落在多个文件中，state.js 没有真正成为单一状态源

---

### H10. 模板字符串过长影响可读性

**位置**: 
- `pages/chat-pages/chat.js` 182-279行 (selectChatAgent 的 chatContent.innerHTML)
- `pages/chat-pages/model-settings.js` 62-104行 (renderModelSettingsPageChat)

**问题类型**: 过长函数 — 模板字符串长达80+行，嵌套引号混乱

**修复方案**: 使用模板文件或 tagged template literals

---

### H11. 回调地狱 / Promise 混用

**位置**: `chat/sidebar.js` 429-438行, `pages/agent-config.js` 多处

```javascript
// ❌ 修复前: Promise 和回调混用
fetch('/api/sessions/' + encodeURIComponent(_sid))
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.success && Array.isArray(d.messages) && typeof window.renderChatMessages === 'function') {
      window.renderChatMessages(d.messages);
    }
  })
  .catch(function(e) { console.error('[sidebar] load session messages failed:', e); });

// ✅ 修复后: 统一 async/await
async function _loadSessionMessages(sessionId) {
  try {
    const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    const d = await r.json();
    if (d.success && Array.isArray(d.messages)) {
      window.renderChatMessages?.(d.messages);
    }
  } catch(e) {
    console.error('[sidebar] load session messages failed:', e);
  }
}
```

---

### H12. 条件分支中的重复逻辑

**位置**: `chat/stream.js` 多处 if/else 分支包含相同逻辑

```javascript
// ❌ 修复前: stream.js appendStream 中
if (accLen < 200 || accLen % 3 === 0 || delta.length > 50) {
  textEl.innerHTML = '';
  _renderMd(textEl, _streamAcc);
}
// ... 
if (accLen < 200 || accLen % 3 === 0 || (delta && delta.length > 50)) {
  _renderMd(textEl, s.acc);
}

// ✅ 修复后: 提取为函数
function _shouldRender(accLen, delta) {
  return accLen < 200 || accLen % 3 === 0 || (delta?.length > 50);
}
```

---

## 🟡 中优先级问题 (Medium)

### M1. 不一致的变量声明方式

**位置**: 整个代码库混用 `var` / `let` / `const`

```javascript
// model-settings.js 中
var CAP_ICONS = {...};     // var
export let settingsModelsCache = []; // let
let _selectedCaps = new Set();  // let

// ✅ 统一使用 const/let，禁止 var
const CAP_ICONS = {...};
export let settingsModelsCache = []; // 需要导出的可变状态用 let
const _selectedCaps = new Set(); // 引用不变用 const
```

---

### M2. 不一致的函数定义方式

**位置**: 混用 function declaration / arrow function / function expression

```javascript
// 同一文件中混用
function _tplSettingsPage() { ... }     // declaration
export const renderSettingsPageChat = (container) => { ... }  // arrow
var _doRemove = function(idx) { ... }   // expression

// ✅ 统一: 模块级用 const + arrow，内部辅助用 function
const _tplSettingsPage = () => { ... };
export const renderSettingsPageChat = (container) => { ... };
function _doRemove(idx) { ... } // 需要 hoisting 的仍用 declaration
```

---

### M3. 注释与代码不一致

**位置**: 
- `chat/state.js` 9行: `// agents 数据由 page_cache 同步，不独立维护 _chatAgents` — 但实际没有 _chatAgents
- `components/model-test.js` 207行: `// loadAvailableModels: removed (dead code, empty stub)` — 注释说已删除但文件末尾仍有引用

---

### M4. 未使用的导入

**位置**:
- `chat/session.js` 14行: `import { updateStreamingBadge } from './state.js'` — 未在文件中使用
- `chat/input.js` 2-12行: 从 state.js 导入大量变量，部分可能未使用

---

### M5. 硬编码 URL 路径

**位置**: 整个代码库大量硬编码 `/api/xxx` 路径

**修复方案**: 创建 API 路由常量文件

---

### M6. 不一致的 toast 调用方式

**位置**: 
- `toast.success('msg')`
- `window.toast.success('msg')`
- `toast && toast.success && toast.success('msg')`
- `showChatToast('msg', 'success')`

---

### M7. 内存泄漏风险 — setInterval 未清理

**位置**: `pages/chat-pages/monitor.js` 308行

```javascript
_memHistoryTimer = setInterval(_collectMemPoint, 1000);
// 没有看到 clearInterval 在页面卸载时调用
```

**修复方案**: 在页面卸载时清理定时器

---

### M8. 深度嵌套的条件判断

**位置**: `chat/message.js` 246-247行

```javascript
// ❌ 双重 JSON 解析
if (typeof meta === 'string') { try { parsedMeta = JSON.parse(meta); } catch(e) { parsedMeta = {}; } }
if (typeof parsedMeta === 'string') { try { parsedMeta = JSON.parse(parsedMeta); } catch(e) { parsedMeta = {}; } }

// ✅ 提取为函数
function safeParseMeta(meta) {
  if (meta == null) return {};
  if (typeof meta !== 'string') return meta;
  try {
    const parsed = JSON.parse(meta);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch(e) {
    return {};
  }
}
```

---

### M9. 不一致的字符串拼接 vs 模板字符串

**位置**: 老代码用字符串拼接，新代码用模板字符串

```javascript
// ❌ 混用
'<div class="siper-msg-row' + (isAgent ? ' agent' : ' user') + '">'
`<div class="siper-msg-row ${isAgent ? 'agent' : 'user'}">`

// ✅ 统一使用模板字符串
```

---

### M10. 事件监听器未清理

**位置**: `chat/thinking.js` 174行, `components/toast.js` 多处

```javascript
// ❌ 修复前: 匿名函数无法移除
document.addEventListener('keydown', function onKey(e) {
  if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
});

// ✅ 修复后: 使用 AbortController 或命名函数引用
const abortCtrl = new AbortController();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
}, { signal: abortCtrl.signal });
// 清理时: abortCtrl.abort();
```

---

### M11. 不一致的默认值处理

**位置**: 多处使用 `||` 处理默认值，但对 `0` 和 `''` 处理不正确

```javascript
// ❌ 当 ws_heartbeat_timeout = 0 时会被替换为 300
ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) || 300

// ✅ 使用 ?? 或显式检查
ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) ?? 300
```

---

### M12. 模板函数命名不一致

**位置**: 
- `_tplSettingsPage()` (settings.js)
- `_tplSessionsPage()` (sessions.js)
- `_tplMonitorShell()` (monitor.js)
- `_buildStatsHtml()` (token.js)

---

### M13. 不一致的模块导出方式

**位置**: 
- `export function xxx()` — 具名导出
- `export const xxx = () => {}` — 箭头函数导出
- `export { xxx, yyy }` — 批量导出
- `export * as Module from '...'` — 命名空间导出

---

### M14. 未处理的 Promise rejection

**位置**: `chat/input.js` 377行, `chat/sidebar.js` 485行

```javascript
// ❌ 修复前
fetch('/api/sessions/' + encodeURIComponent(_chatSessionId) + '/model', {...}).catch(() => {});
ws.send(JSON.stringify({ type: 'new_session', agent: agent ? agent.name : 'default' }));

// ✅ 修复后
async function _syncModelToSession(sessionId, model) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {...});
  } catch(e) {
    console.warn('[session] model sync failed:', e.message);
  }
}
```

---

### M15. 不一致的 querySelector 使用

**位置**: 混用 `getElementById` / `querySelector` / `querySelectorAll`

---

## 🟢 低优先级问题 (Low)

### L1. 缺少 JSDoc 注释

**位置**: 大部分内部辅助函数缺少参数/返回值说明

---

### L2. 不一致的文件头注释风格

**位置**: 有些有 `/** ... */` JSDoc，有些只有 `//` 单行注释

---

### L3. 未使用的 CSS class 引用

**位置**: `chat/message.js` 77行 `class="js-hidden"` 但元素初始就包含此 class

---

### L4. 可简化的布尔表达式

**位置**: 
```javascript
// ❌
if (exists) { ... } else { ... }
sidebar.classList.toggle('expanded', !!v);
sidebar.classList.toggle('collapsed', !v);

// ✅
sidebar.classList.toggle('expanded', v);
sidebar.classList.toggle('collapsed', !v);
```

---

### L5. 魔法字符串 — 消息类型

**位置**: `core.js` switch 中的 `'state_full'`, `'stream_delta'` 等

---

### L6. 可提取为常量的 CSS 选择器

**位置**: 重复的 `'#chatMessages'`, `'.siper-stream-row'` 等

---

### L7. 不一致的缩进

**位置**: 大部分文件使用2空格缩进，但部分代码片段有4空格

---

### L8. 未使用的变量

**位置**: `chat/sidebar.js` 354行 `_prevAgent` 声明后未使用

---

### L9. 可简化的返回语句

**位置**: 
```javascript
// ❌
if (condition) return true;
else return false;

// ✅
return condition;
```

---

### L10. 不一致的模块加载方式

**位置**: 静态 import 和动态 `import()` 混用，有些模块同时使用两种方式

---

## 📋 修复优先级建议

### 第一批 (立即修复 — 影响可维护性)
1. **C1/C2/C3** — 统一文件图标、能力标签、文件上传逻辑
2. **C5** — 减少 window 全局挂载，改用命名空间
3. **C6/C7** — 统一 clipboard 和时间格式化
4. **H1** — 提取魔法数字为常量

### 第二批 (短期 — 减少重复)
5. **C8** — 统一模型验证逻辑
6. **H3/H7** — 统一自动保存和占位页面
7. **H11** — 统一 async/await
8. **H2** — 统一错误处理

### 第三批 (中期 — 架构优化)
9. **C4/H5** — 拆分过长函数/文件
10. **H4/H6** — 消除功能重叠
11. **H9** — 集中状态管理
12. **H8** — 统一 API 请求封装

### 第四批 (长期 — 代码质量)
13. M1-M15 — 统一代码风格
14. L1-L10 — 细节优化

---

## 📈 代码质量指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 总代码行数 | ~12,000+ | 减少 20% |
| 重复代码比例 | ~15% | < 5% |
| 单文件最大行数 | 860 | < 400 |
| 单函数最大行数 | 140 | < 50 |
| 全局变量数量 | 40+ | < 10 |
| 魔法数字 | 30+ | 0 |
