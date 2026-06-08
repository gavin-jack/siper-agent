# MD 渲染修复 v2026-08-07e — olRe 误分割 heading + renderMarkdown 返回类型

## 问题：序号 1、2、3 渲染为 1、1、1

**现象**：`### 1. xxx`、`### 2. xxx`、`### 3. xxx` 被渲染为三个 `<ol><li>`（都显示为 1.），而非三个 `<h3>`。

**根因**：两个独立 bug 叠加：

### Bug 1: `headingNumMatch` 拆分导致空 heading

`headingNumMatch` 正则 `/^(#{1,6})(\d[\d\-]*\..*)$/` 匹配 `###1.`（无空格），原实现拆成两行：
```
expanded.push(g1);  // "###"
expanded.push(g2);  // "1. xxx"
```
`###` 单独一行 → 空 heading → `<hr>`，`1. xxx` → `<ol><li>`。

**修复**：改为合并加空格：
```js
expanded.push(g1 + ' ' + g2);  // "### 1. xxx"
```

### Bug 2: `olRe` 误分割 heading 行

`olRe = /(?<=\D|^)(?=\d+\.\s\S)/g` 在 `### 2. text` 中，`### ` 后面是 `2.`，lookbehind 匹配空格（\D），lookahead 匹配 `2. `，于是在 `### ` 和 `2. text` 之间插入分割点。

结果：`###` → 空 heading → `<hr>`，`2. text` → `<ol><li>`。

**修复**：在 `olRe` 的 if 条件中增加 heading 检查：
```js
if (!/^#{1,6}/.test(l.trim())) {
    // 只在非 heading 行执行 olRe 分割
}
```
同样适用于 `olRe2`。

## renderMarkdown 返回 DocumentFragment

`renderMarkdown()` 返回 `DocumentFragment`，**没有 `innerHTML` 属性**。

测试方式：
```js
// 错误：result.innerHTML → undefined
// 正确：
Array.from(result.childNodes).map(n => n.tagName + '.' + n.textContent.substring(0,30)).join(' | ')
```

## 验证方法

1. Node.js 模拟：复制 renderMarkdown 核心循环，用 `console.log` 输出 childNodes
2. 浏览器：发送包含 `### 1. xxx` 的消息，查询 `.msg-body` 的 `innerHTML`
3. 预期：`<h3>1. xxx</h3>` 而非 `<hr><ol><li>xxx</li></ol>`

## 相关 commits

- `c43e49a` — fix: 修复heading数字粘连和olRe误分割heading行
