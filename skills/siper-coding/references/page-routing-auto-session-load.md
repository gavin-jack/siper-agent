# 页面路由与自动加载最新会话（v0.9.56+）

## 问题：进入页面不显示历史会话

用户进入 `http://localhost:9724/` 时，chat 页面显示空白，不会自动加载最近的会话历史。

## 根因分析

### Bug 1：`loadRecentSession` 死循环
`core.js` 第 1865 行设置 `currentSession = latest.session_id`，然后第 1874 行 `if (currentSession) return;` 直接返回，导致永远不会执行第 1879 行的 `loadSessionHistory`。

```javascript
// 修复前（有 bug）：
currentSession = latest.session_id;  // ← 设置了 currentSession
// ...
if (currentSession) return;          // ← 总是 true，直接返回！
await loadSessionHistory(currentSession);  // ← 永远不会执行
```

### Bug 2：`loadSessionHistory` 函数不可用
`loadSessionHistory` 定义在 `page-sessions.js` 中，但 `core.js` 在 `page-sessions.js` 之前加载（index.html 中 script 标签顺序）。当 `core.js` 的 `loadRecentSession` 调用 `loadSessionHistory` 时，函数还不存在。

**解决方案**：内联会话历史加载逻辑，不依赖外部函数。

### Bug 3：DOMContentLoaded 不加载会话
`DOMContentLoaded` 处理中，默认显示 chat 页面但不调用 `loadRecentSession`。

## 修复方案

### 1. 修复 loadRecentSession（移除死循环 + 内联加载）

```javascript
async function loadRecentSession() {
  try {
    const r = await fetch('/api/sessions');
    const data = await r.json();
    if (!data.sessions || !data.sessions.length) return;
    const sorted = data.sessions
      .filter(s => s.active === true && s.messages > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    if (!sorted.length) return;
    const latest = sorted[0];
    currentSession = latest.session_id;
    if (currentPage === 'chat') {
      const chatEl = document.getElementById('chatMessages');
      if (chatEl && chatEl.children.length > 0) return;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelector('[data-page="chat"]').classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-chat').classList.add('active');
      // 内联加载会话历史（不依赖 page-sessions.js 中的 loadSessionHistory）
      try {
        const sr = await fetch('/api/sessions/' + currentSession);
        const sData = await sr.json();
        if (sData.success && sData.messages && sData.messages.length) {
          chatEl.innerHTML = '';
          for (const m of sData.messages) {
            const role = m.role === 'user' ? 'user' : 'agent';
            addMsg(m.content || '', role);
          }
          chatEl.scrollTop = chatEl.scrollHeight;
        }
      } catch(se) { console.error('load session history error:', se); }
    }
  } catch(e) { console.error('loadRecentSession error:', e); }
}
```

### 2. DOMContentLoaded 自动加载

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // ... 主题恢复、hash 路由 ...
  
  // 默认 chat 页面设置 hash
  if (!location.hash || location.hash === '#') location.hash = 'chat';
  
  // 自动加载最新会话（延迟 500ms 等 WS 连接建立）
  setTimeout(() => { loadRecentSession(); }, 500);
});
```

### 3. Hash 路由设置

确保默认 chat 页面也有 `#chat` hash：
```javascript
if (!location.hash || location.hash === '#') location.hash = 'chat';
```

## JS 文件加载顺序陷阱

**核心规则**：`core.js` 中不能调用 `page-*.js` 中定义的函数。

index.html 中的加载顺序：
```html
<script src="/static/pages/core.js?v=..."></script>      <!-- 先加载 -->
<script src="/static/pages/page-sessions.js"></script>   <!-- 后加载 -->
<script src="/static/pages/page-chat.js"></script>       <!-- 后加载 -->
...
```

如果 `core.js` 需要调用其他页面的函数，必须：
1. 内联实现（推荐）
2. 或将函数提升到 `core.js` 中
3. 或通过事件/回调机制解耦

## 验证方法

1. 刷新页面后检查 `location.hash === '#chat'`
2. 检查 chat 区域是否有历史消息
3. 检查 `currentSession` 是否被正确设置
4. 从其他页面切回 chat，历史应保持不变
