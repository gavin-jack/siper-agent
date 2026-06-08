# markdown-it 14.x Renderer Rules 限制

## 问题

尝试通过 `md.renderer.rules.table_open` / `heading_open` / `paragraph_open` 等 rules 给 HTML 元素添加 CSS 类名，发现这些 rules 全部返回 `undefined`。

## 根因

**markdown-it 14.x 只暴露 9 个 renderer rules**：

```javascript
Object.keys(md.renderer.rules)
// => ["code_inline", "code_block", "fence", "image", "hardbreak", "softbreak", "text", "html_block", "html_inline"]
```

**不存在的 rules**（在 markdown-it 14.x 中）：
- `table_open` / `table_close`
- `heading_open` / `heading_close`
- `paragraph_open` / `paragraph_close`
- `bullet_list_open` / `bullet_list_close`
- `ordered_list_open` / `ordered_list_close`
- `blockquote_open` / `blockquote_close`
- `hr`
- `link_open` / `link_close`

这些元素通过 markdown-it 内置的 `render()` 方法直接渲染，不经过 renderer rules 系统。

## 验证方法

```javascript
const md = window.markdownit({ html: true, breaks: true, linkify: true });
console.log(Object.keys(md.renderer.rules));
// 只输出 9 个
```

## 正确方案

**方案 A（推荐）：CSS 标签选择器**

```css
/* 替代 .msg-body .md-table */
.msg-body table { ... }
.msg-body h1, .msg-body h2, ... { ... }
.msg-body p { ... }
.msg-body ul, .msg-body ol { ... }
.msg-body blockquote { ... }
.msg-body hr { ... }
.msg-body a { ... }
.msg-body pre { ... }
```

**方案 B（仅 code_inline）：自定义 renderer**

```javascript
const _prev = _md.renderer.rules.code_inline;
_md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
  tokens[idx].attrPush(['class', 'md-code-inline']);
  return _prev(tokens, idx, options, env, self);
};
```

**⚠️ 注意**：
- 使用 `attrPush(['class', 'name'])`，**不是** `attrJoin('class', 'name')`（不存在此方法）
- `fence` rule 存在但 token 没有 `attrJoin`/`attrPush`，不能用同样方式添加类名。CSS 中用 `.msg-body pre` 选择器替代。

## 历史教训

v0.9.59 初次集成时，尝试通过 9 个自定义 renderer rules 添加 CSS 类名（table_open, heading_open, paragraph_open, bullet_list_open, ordered_list_open, blockquote_open, hr, fence, link_open）。这些 rules 全部无效，导致生成的 HTML 没有类名，CSS 样式不匹配。最终改为 CSS 标签选择器方案。
