# newSession 执行链路分析（v0.4.43）

## 问题描述

在会话管理页面点击"+ 新会话"按钮后，期望行为是：
1. 跳转到对话页面
2. 右侧聊天区域为空白（不显示任何历史消息）
3. 可以开始全新对话

## 执行链路

```
用户点击 "+ 新会话"
  → page-sessions.js: newSession()
    → currentSession = null
    → chatMessages.innerHTML = ''  (清空聊天区)
    → ws.send({type: 'new_session'})  (通知后端)
    → navigateToPage('chat', true)  (跳转到 chat 页面，不更新 hash)
      → 切换 page-chat 为 active
      → currentPage = 'chat'
      → chatEl.children.length === 0 && currentSession !== null ?
        → currentSession 为 null → 不调用 loadRecentSession ✓
  → WS connected 消息到达
    → currentSession = d.session_id (后端新会话 ID)
    → loadRecentSession() 被调用
      → currentPage === 'chat' → true
      → chatEl.children.length === 0 → true
      → 加载最近活跃会话历史 → 覆盖空白聊天区 ✗
```

## 根因

`navigateToPage` 的 chat 分支中虽然加了 `currentSession !== null` 防护，但 WS `connected` 消息处理中的 `loadRecentSession()` 是无条件调用的。执行顺序：

1. `navigateToPage('chat')` → `currentSession = null` → 防护生效 ✓
2. WS `connected` 到达 → `currentSession = d.session_id` → `loadRecentSession()` → 加载旧历史 ✗

## 已完成的修复

1. **page-sessions.js** `newSession()`：去掉系统消息、添加 `navigateToPage('chat', true)` 跳转
2. **core.js** `navigateToPage()` chat 分支：增加 `currentSession !== null` 防护

## 未完成的修复

WS `connected` 消息中的 `loadRecentSession()` 仍会加载旧历史。彻底修复方案：

**方案 A**：newSession() 不设 skipHash，改为 `navigateToPage('chat')`，让 URL hash 变为 `#chat`。刷新后 DOMContentLoaded 走 else 分支留在 chat 页面。

**方案 B**：在 WS connected 处理中增加检查，如果当前是 newSession 创建的空白聊天区，不调用 loadRecentSession。需要标志位。

## 当前状态（v0.4.43）

- 点击"新会话"后跳转到 chat 页面 ✓
- 聊天区暂时为空白 ✓
- 但 WS connected 消息可能随后加载旧历史覆盖空白区 △
- F5 刷新后，如果 hash 为空或 #chat，停留在 chat 页面 ✓
- F5 刷新后，如果 hash 为 #sessions，跳回 sessions 页面（因为 newSession 用了 skipHash=true）△

## 调试检查点

```javascript
// 浏览器控制台检查
document.getElementById('page-sessions').className  // 应不含 'active'
document.getElementById('page-chat').className      // 应含 'active'
document.getElementById('chatMessages').children.length  // 应为 0
location.hash  // newSession 后仍为空（skipHash=true 的副作用）
```
