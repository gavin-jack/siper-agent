# markdown-it 集成参考（v0.9.59+）

## 概述

SiPer 的 Markdown 渲染从手写 regex 方案切换为 markdown-it 14.1.0，同时保留预处理逻辑处理 LLM 非标准输出。

## 文件变更

### 新增文件
- `webui/static/markdown-it.min.js`（123KB，markdown-it 14.1.0 minified UMD）

### 修改文件
- `webui/templates/index.html`：在 core.js 之前添加 `<script src="/static/markdown-it.min.js"></script>`
- `webui/static/pages/core.js`：
  - 删除手写 `renderMarkdown` 函数（~417 行）
  - 新增 `_md`（markdown-it 实例）+ 自定义 renderer 规则（~15 行，仅 code_inline）
  - 新增 `_preprocessMd()` 预处理函数（~55 行）
  - 新增 `renderMarkdown()` 适配器函数（~10 行）
- `webui/static/style.css`：所有 `.msg-body .md-*` 类名选择器改为标签选择器

## 核心架构

```
原始 Markdown 文本
    ↓
_preprocessMd()    ← 预处理 LLM 非标准输出
    ↓                  1. Tab-separated → pipe-format GFM table rows
    ↓                  2. Bold fragments split across lines → merged
    ↓                  3. "text | col1 | col2 |" → split into paragraph + table row
_md.render()       ← markdown-it 标准 CommonMark + GFM 解析
    ↓
HTML string → DocumentFragment → appendChild
```

## markdown-it 配置

```javascript
const _md = markdownit({
  html: true,
  breaks: true,
  linkify: true,
  typographer: false
});
```

## ⚠️ markdown-it 14.x Renderer Rules 关键限制

**markdown-it 14.x 只暴露 9 个 renderer rules**：

```
code_inline, fence, image, hardbreak, softbreak, text, html_block, html_inline
```

**不存在的 rules**（调用会返回 undefined）：
- ~~table_open~~ → 表格通过内置 render() 渲染，无法 hook
- ~~heading_open~~ → 同上
- ~~paragraph_open~~ → 同上
- ~~bullet_list_open~~ → 同上
- ~~ordered_list_open~~ → 同上
- ~~blockquote_open~~ → 同上
- ~~hr~~ → 同上
- ~~link_open~~ → 同上

**结论**：不能通过 renderer rules 给 table/heading/list/blockquote/hr/link/p 添加 CSS 类名。

## 正确的 CSS 适配方案

**方案：用标签选择器替代类名选择器**（唯一可行方案）

| 之前（类名选择器） | 之后（标签选择器） |
|---|---|
| `.msg-body .md-para` | `.msg-body p` |
| `.msg-body .md-heading` | `.msg-body h1, .msg-body h2, ...` |
| `.msg-body .md-h1` | `.msg-body h1` |
| `.msg-body .md-table` | `.msg-body table` |
| `.msg-body .md-list` | `.msg-body ul, .msg-body ol` |
| `.msg-body .md-blockquote` | `.msg-body blockquote` |
| `.msg-body .md-hr` | `.msg-body hr` |
| `.msg-body .md-link` | `.msg-body a` |
| `.msg-body .md-code-block` | `.msg-body pre` |
| `.msg-body .md-code-inline` | `.msg-body .md-code-inline`（保留，通过 renderer 添加） |

## 唯一有效的自定义 Renderer：code_inline

```javascript
const _prevCodeInline = _md.renderer.rules.code_inline;
_md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
  tokens[idx].attrPush(['class', 'md-code-inline']);
  return _prevCodeInline(tokens, idx, options, env, self);
};
```

**⚠️ 必须用 `attrPush(['class', 'name'])`，不能用 `attrJoin('class', 'name')`** — markdown-it token 没有 `attrJoin` 方法。

**⚠️ fence rule 不能添加类名**：`fence` token 是字符串类型（不是 Token 对象），调用 `tokens[idx].attrPush(...)` 会报 `TypeError: Cannot read properties of undefined (reading 'info')`。代码块 `<pre>` 只能通过 CSS 标签选择器（`.msg-body pre`）样式化，不能添加自定义类名。

## 预处理逻辑（_preprocessMd）

### 1. Tab-separated → pipe-format GFM table rows

检测连续 2+ 行含 2+ 个 tab 的行，自动转换为 `| col1 | col2 |` 格式。排除含 `|`、以 `#` 开头、列表、引用块。

### 2. Bold fragments split across lines

检测 `**` 单独一行或行以 `**` 开头但未闭合，收集直到闭合 `**`，合并为单行。

### 3. Mixed line "text | col1 | col2 |" → split

检测行首有文本后跟 `|` 分隔的表格行，分割为段落 + 表格行。

## renderMarkdown 适配器

```javascript
function renderMarkdown(text) {
  if (!text) return document.createTextNode('');
  text = _preprocessMd(text);
  const html = _md.render(text);
  const frag = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  return frag;
}
```

返回 `DocumentFragment`，兼容所有调用点（流式渲染 3 处 + page-chat.js 1 处）。

## 验证方法

1. `node -c core.js` — 语法检查
2. `curl -s -o /dev/null -w "%{http_code}" http://localhost:9724/static/markdown-it.min.js` — 200 表示库可访问
3. 浏览器硬刷新后发送含表格的消息，验证渲染效果

## 已知陷阱

1. **markdown-it 14.x renderer rules 极少**：只有 9 个，table/heading/list 等无法通过 renderer 添加类名，必须用 CSS 标签选择器
2. **`attrJoin` 不存在**：必须用 `attrPush(['class', 'name'])`
3. **browser_console JS 隔离**：browser_console 不加载页面脚本，不能用 `typeof renderMarkdown` 验证函数是否存在
4. **CSS 类名不匹配**：如果 CSS 使用 `.msg-body .md-table` 类名选择器，但 markdown-it 生成的 `<table>` 没有 `md-table` 类名，样式不会生效。必须用标签选择器或确保 renderer 正确添加类名
5. **大函数替换**：patch 跨越函数边界会导致语法错误，用 head+tail+cat 重建
6. **预处理顺序**：Tab 转换必须在混合行分割之前
