# Typing Indicator 与流式消息并存 Bug

## 现象

用户发送消息后，"正在思考"指示器显示，同时流式消息气泡也开始逐字出现（stream_delta 在渲染），两者并存。用户看到消息已经在输出了，但下方仍显示"SiPer 正在思考..."。

## 根因

`sendMessage()`（page-chat.js:649）发送 WS 消息后立即设置 `typingEl.className = 'typing active'`。

`stream_delta` 处理分支（core.js:1387-1409）只创建消息气泡并追加内容，**没有**将 `typingEl.className = 'typing'` 去掉。

typing 只在以下时机被隐藏：
- `stream_end`（core.js:1500-1501）
- `response`（core.js:1694-1695）
- `ws.onclose`（core.js:1366-1367）
- `stopGeneration()`（page-chat.js:666-667）

**缺失**：`stream_delta` 首次到达时（即第一个 delta 气泡创建时）应同步隐藏 typing。

## 修复方案

在 `stream_delta` 处理分支中，首次创建气泡后（`_streamBubble` 从 null 变为有值时）添加：

```js
if (!_streamBubble) {
  // ... 创建气泡代码 ...
  // 首次创建气泡时隐藏 typing
  const _te = document.getElementById('typing');
  if (_te) _te.className = 'typing';
}
```

## 诊断方法

1. 发送消息，观察 chatMessages 区域
2. 如果看到消息气泡开始渲染的同时底部仍显示"正在思考"，即为该 bug
3. 确认：`document.getElementById('typing').className === 'typing active'` + `_streamBubble !== null`

## 关联文件

- `webui/static/pages/page-chat.js:649` — sendMessage 中显示 typing
- `webui/static/pages/core.js:1387-1409` — stream_delta 处理（缺少隐藏 typing）
- `webui/static/pages/core.js:1500-1501` — stream_end 中隐藏 typing
- `webui/static/pages/page-chat.js:666-667` — stopGeneration 中隐藏 typing
