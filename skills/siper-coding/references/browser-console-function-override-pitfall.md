# Browser Console 覆盖页面函数陷阱（v0.9.66+）

## 问题描述
在 `browser_console` 中执行 `window.renderMarkdown = function(...)` 会**永久覆盖**页面中的 renderMarkdown 函数。即使执行 `delete window.renderMarkdown`，页面刷新后 core.js 会重新定义该函数，但浏览器可能缓存旧版本的 core.js，导致覆盖后的版本持续存在。

## 诊断方法
```js
// 在 browser_console 中检查函数长度
renderMarkdown.toString().length
// 正常：~17000+ 字符
// 被覆盖：~300 字符（异常短）
```

## 恢复方法
1. **硬刷新浏览器**（Ctrl+Shift+R）加载最新 core.js
2. 确认 index.html 中的 `?v=` 版本号已更新
3. 验证：`renderMarkdown.toString().length` 恢复正常

## 预防规则
- **禁止在 browser_console 中给 window 上的函数赋值**
- 如果必须覆盖（如调试），使用局部变量而非 window 属性
- 调试代码执行后立即恢复原始函数

## 本次事故
调试 renderMarkdown 列表 + code span bug 时，在 browser_console 中执行了：
```js
const origRM = renderMarkdown;
renderMarkdown = function(text) { ... return origRM(text); };
```
这导致 renderMarkdown 被覆盖，后续所有调用都返回错误结果。即使删除后，浏览器缓存导致问题持续。
