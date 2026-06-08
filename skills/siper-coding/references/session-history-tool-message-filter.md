# 会话历史记录中过滤 Tool 消息

## 问题描述

后端 API `/api/sessions/:id` 返回所有消息，包括 `role=tool` 的工具结果消息（如 web_search 的搜索结果 dict）。前端在渲染会话历史记录时**没有过滤 tool 消息**，直接把搜索结果文本当作 agent 消息显示。

用户看到的症状：会话记录中出现 `{'title': '...', 'url': '...', 'snippet': ''}` 等 Python dict 格式内容。

## 根因

`page-sessions.js` 中的两个渲染函数都没有过滤 `role=tool` 的消息：

1. `loadSessionHistory()` — 聊天页面加载历史消息
2. `previewSession()` — 会话预览面板

原代码：
```javascript
for (const m of data.messages) {
  const role = m.role === 'user' ? 'user' : 'agent';
  // ... 渲染所有消息
}
```

## 修复方案

在两处渲染循环中都加 `if (m.role === 'tool') continue;`：

```javascript
for (const m of data.messages) {
  if (m.role === 'tool') continue;  // 跳过工具结果
  const role = m.role === 'user' ? 'user' : 'agent';
  // ... 正常渲染
}
```

## 诊断方法

会话记录中出现 dict 格式内容 = tool 消息未被过滤。

```javascript
// 检查 API 返回的消息角色分布
fetch('/api/sessions/<id>').then(r => r.json()).then(d => {
  d.messages.forEach(m => console.log(m.role, m.content?.substring(0, 50)));
});
```

## Git Commit

- `8232ba2` — fix: skip tool role messages in session history display
