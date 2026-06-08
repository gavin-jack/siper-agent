# appendMeta text 变量作用域 Bug（v0.9.87y）

## 现象

消息气泡的 meta 信息（token 统计、时间）不显示，只显示工具和技能行。

## 根因

`page-chat.js` 的 `appendMeta()` 函数第 399 行引用了 `text` 变量，但该变量在独立的 `if` 块内不可达。

`text` 在第 365 行 `if (items.length > 0) { const text = ... }` 内定义，
第 399 行在独立的 `if (cfg.showToolSteps && ...)` 块内 → `ReferenceError`。

## 修复

```js
// ❌ 错误
const toolsLink = text.querySelector('.meta-tools-link');
// ✅ 正确：用 m（msg-meta 容器，函数顶部定义）
const toolsLink = m.querySelector('.meta-tools-link');
```

## 诊断

1. `browser_console` 中 `appendMeta(el, meta)` 报 `ReferenceError: text is not defined`
2. `document.querySelector('.msg-meta').textContent` 只有 tools/skills 无 token/time

## 关联：page-chat.js Cache-Buster

修改 page-chat.js 后必须在 index.html 中加 `?v=` 版本号，否则浏览器用旧缓存。
