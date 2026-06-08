# 会话历史加载阻塞主线程导致页面假死

**发现日期**: 2026-08-03
**状态**: 已添加安全计数器防御，根本解决方案待实现

## 症状

页面加载后，"记忆已刷新" toast 弹出，然后页面完全无响应。浏览器控制台也卡死（按回车无反应）。但 API 服务正常（curl 返回 200）。

## 根因

`loadSessionHistory()` 在 WS `connected` 时触发，对每条消息同步调用 `addMsg()` → `renderMarkdown()` → DOM 操作。

当会话消息较多（如 38 条）时：
- 每条消息的 renderMarkdown 需要多次正则匹配和 lines.splice()
- splice 在大型数组上是 O(n) 操作，整体可能达到 O(n²)
- 38 次同步调用累积阻塞主线程数百毫秒到数秒
- 浏览器主线程被完全占用，UI 事件无法响应

## 诊断特征

1. 页面能加载（API 调用完成，toast 弹出）
2. 之后所有 UI 操作无响应
3. 浏览器控制台也卡死
4. curl API 正常（服务未崩溃）
5. 刷新页面同样卡死（确定性，非竞态）

## 已实施的防御

1. renderMarkdown 主循环添加安全计数器 `_maxIter = 5000`（固定值，非动态）
2. pre-processing for 循环添加安全计数器 `_preProcMax = max(lines.length * 5, 2000)`
3. 超限时返回 `[渲染超时，内容过长]` 并 console.error

## 根本解决方案（待实现）

异步分批渲染：在 loadSessionHistory 中使用 `setTimeout(r, 0)` 或 `requestAnimationFrame` 让出主线程：

```javascript
async function loadSessionHistory(sid) {
  // ... fetch messages ...
  for (let i = 0; i < msgs.length; i++) {
    addMsg(msgs[i]);
    // 每渲染 5 条消息让出主线程一次
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }
}
```

## 相关文件

- page-sessions.js: loadSessionHistory() (line 94+)
- page-chat.js: addMsg() (line 162+), renderMarkdown 调用 (line 255)
- core.js: renderMarkdown() (line 2731+)
