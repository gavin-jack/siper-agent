# Browser Console JS 执行环境（v0.9.74+ 更新）

## 核心结论

**`browser_console` 的 JS 执行环境与页面隔离。** 但实际行为是**间歇性**的：

- 多数情况下 `typeof renderMarkdown === 'undefined'`（隔离生效）
- 偶尔 `typeof renderMarkdown === 'function'`（可能是 browser tool 缓存了之前注入的 script）
- 同一 session 中可能第一次 `undefined`，再次检查时变成 `function`

**最佳实践**：始终先检查 `typeof renderMarkdown`，如果是 `undefined` 则动态注入 script 标签。

## 验证方法

```javascript
// 在 browser_console 中执行
typeof renderMarkdown
// 返回 "undefined" 或 "function" — 两种都可能
```

## 正确使用方式（动态注入）

由于隔离，必须动态注入 script 标签加载页面 JS：

```javascript
// Promise 方式等待加载完成
(function() {
  return new Promise(function(resolve) {
    var s = document.createElement('script');
    s.onload = function() {
      resolve('renderMarkdown type: ' + typeof renderMarkdown);
    };
    s.onerror = function(e) { resolve('Error: ' + e); };
    s.src = '/static/pages/core.js?v=' + Date.now();
    document.head.appendChild(s);
  });
})()
```

加载完成后即可调用：

```javascript
(function() {
  var md = '| A | B |\n|---|---|\n| 1 | 2 |';
  var r = renderMarkdown(md);
  var d = document.createElement('div');
  d.appendChild(r);
  return d.innerHTML;
})()
```

## DOM 不可见现象

- `document.querySelectorAll('script').length` 返回 0
- `Object.getOwnPropertyNames(window)` 中没有页面定义的函数
- `document.documentElement.outerHTML` 返回 `<html><head></head><body></body></html>`（空 DOM）
- 但 `browser_snapshot` 显示完整页面内容

这是 browser tool 的隔离机制：snapshot 看到的是渲染后的 DOM 快照，但 JS 执行上下文是独立的。

## 历史认知变迁

| 版本 | 认知 | 正确性 |
|------|------|--------|
| v0.9.57 | browser_console 不加载页面脚本 | ✅ 正确 |
| v0.9.70 | 修正为"共享上下文" | ❌ 错误 |
| v0.9.71 | 再次确认隔离 | ✅ 正确 |

## 实际行为：间歇性可用（v0.9.74+ 观察）

**注意**：虽然 v0.9.71 确认了隔离，但在实际使用中 `renderMarkdown` 的行为是**间歇性**的：

- 有时 `typeof renderMarkdown === 'function'` 直接可用（可能是 browser tool 缓存了之前注入的 script）
- 有时 `typeof renderMarkdown === 'undefined'`（隔离生效）
- 有时第一次 `undefined`，再次检查时变成 `function`

**最佳实践**：
1. 先检查 `typeof renderMarkdown`
2. 如果是 `function`，直接使用
3. 如果是 `undefined`，动态注入 script 标签后使用
4. **不要假设它始终可用或始终不可用**

```javascript
// 安全的使用模式
(function() {
  if (typeof renderMarkdown === 'function') {
    // 直接可用
    var frag = renderMarkdown(md);
    // ...
  } else {
    // 需要动态注入
    var s = document.createElement('script');
    s.src = '/static/pages/core.js?v=' + Date.now();
    s.onload = function() {
      var frag = renderMarkdown(md);
      // ... 注意：这里需要同步返回值，用 Promise 或回调
    };
    document.head.appendChild(s);
  }
})()
```

**注意**：动态注入后 `renderMarkdown` 变为可用，但 `browser_console` 的返回值是同步的。如果需要获取渲染结果，必须在 `onload` 回调内完成所有操作并返回。

## 相关文件
- `references/markdown-table-test-suite.md` — 使用 browser_console 测试 MD 表格渲染
- `references/markdown-pipe-in-code-protection.md` — 使用动态注入方式测试 pipe 保护
