# core.js forEach 回调括号匹配陷阱（v20260806）

## 描述

在 core.js 的 IIFE 末尾添加 `forEach` 事件监听器块时，结尾括号容易多写一个 `)`：

```javascript
// ❌ 错误 — 多了一个 )
sidebar.querySelectorAll('.foo').forEach(function(btn) {
  btn.addEventListener('mouseenter', function(e) { ... });
  btn.addEventListener('mouseleave', function() { ... });
}));  // ← 多余的 )

// ✅ 正确
sidebar.querySelectorAll('.foo').forEach(function(btn) {
  btn.addEventListener('mouseenter', function(e) { ... });
  btn.addEventListener('mouseleave', function() { ... });
});  // ← querySelectorAll 的 ) + forEach 的 );
```

## 影响

- `node -c core.js` 报 `Syntax Error: Unexpected token ')'`
- 整个 core.js 解析失败，IIFE 内所有函数未定义
- 页面表现为：collapse 按钮点击无反应、tooltip 不显示等
- `browser_console` 中 `typeof toggleSidebarCollapse` 返回 `undefined`

## 修复

1. `node -c core.js` 定位语法错误
2. 搜索 `}));` 模式，确认是否是多余的 `)`
3. 将 `}));` 改为 `});`
4. 再次 `node -c core.js` 验证

## 预防

- 添加 forEach 块后立即 `node -c core.js` 验证
- 注意嵌套层级：`querySelectorAll(...)` 的 `)` + `forEach(...)` 的 `)` = `});`
- 如果回调内有多个 `addEventListener`，每个都以 `});` 结尾，不是 `}));`
