# Session Switch — 进入对话 Bug 修复 (v0.9.21)

## 问题描述

用户点击会话列表中某个会话的"进入对话"按钮后，chat 页面显示的消息是**最近活跃会话**的消息，而非所选会话的消息。

## 根因分析

两个独立问题叠加：

### 问题 1：switchSession 发送了无效的 WS 消息

`page-sessions.js` 的 `switchSession(sid)` 发送了 `{type: 'get_history', session_id: sid}` WS 消息，但后端 `siper_web.py` 的 `ws_handler` 不处理 `get_history` 消息类型（后端只有 `message` 类型）。结果：消息历史从未通过 WS 加载。

### 问题 2：loadRecentSession 覆盖了所选会话

switchSession 的执行顺序：
1. currentSession = sid（设置所选会话）
2. chatMessages.innerHTML = ''（清空消息）
3. navigateToPage('chat')（导航到 chat）
4. 发送无效的 WS get_history（无实际效果）

步骤 3 中，navigateToPage('chat') 触发 loadRecentSession()（因为 currentPage === 'chat' 且 chatEl.children.length === 0）。loadRecentSession 设置 currentSession = latest.session_id，覆盖了步骤 1 设置的所选会话。

## 修复方案

### 修复 1：switchSession 改用 HTTP fetch 加载历史

```javascript
// 之前（无效）：
ws.send(JSON.stringify({type: 'get_history', session_id: sid}));

// 之后（正确）：
await loadSessionHistory(sid);
```

loadSessionHistory 使用 fetch('/api/sessions/' + sid) HTTP 请求，后端有对应的路由处理。

### 修复 2：移除 switchSession 中的提前清空（v0.9.63+）

旧代码在 navigateToPage 之前清空 chatMessages：
```javascript
// 旧代码（有问题）：
currentSession = sid;
document.getElementById('chatMessages').innerHTML = '';  // ← 这行导致问题
navigateToPage('chat');
await loadSessionHistory(sid);
```

问题：navigateToPage('chat') 中会检查 chatMessages 是否为空，如果为空且 currentSession 不为 null，会触发 loadRecentSession() 加载最新会话，覆盖用户选择的会话。

修复：移除提前清空，让 loadSessionHistory 自己处理清空和加载：
```javascript
// 新代码（正确）：
currentSession = sid;
navigateToPage('chat');
await loadSessionHistory(sid);
```

**注意**：旧文档中提到的 `if (currentSession) return;` 守卫方案不够精确——它会导致页面初始化时无法自动加载最新会话。正确的修复是移除提前清空。

## 验证方法

1. 在会话列表中选择非最近活跃的会话（消息内容不同的会话）
2. 点击"进入对话"
3. 确认 chat 页面显示的是该会话的消息，而非最近会话的消息
4. 检查 currentSession 是否与所选会话 ID 一致

## 相关文件

- webui/static/pages/page-sessions.js — switchSession 函数
- webui/static/pages/core.js — loadRecentSession 函数、navigateToPage 函数
