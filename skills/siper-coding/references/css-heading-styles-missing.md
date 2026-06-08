# CSS Heading 样式缺失陷阱

## 症状

`### 三级标题`、`## 二级标题` 等 Markdown 标题在页面中渲染为普通段落文本，没有加大字号、加粗、边距等标题样式。JS 逻辑正确（`<h3 class="md-heading md-h3">` 元素存在），但视觉上与正文无异。

## 根因

`style.css` 中**完全没有** `.md-heading` / `.md-h1`–`.md-h6` 的样式定义。`core.js` 的 `renderMarkdown` 函数会正确生成带 `md-heading md-hN` 类名的 `<h1>`–`<h6>` 元素，但 CSS 没有为这些类名定义任何样式，导致标题以浏览器默认样式渲染（通常与正文差异很小）。

## 诊断步骤

1. **确认 JS 渲染正确**：在 browser_console 中执行：
   ```js
   document.querySelectorAll('.md-heading').length
   ```
   返回 > 0 说明 JS 渲染正常。

2. **检查 CSS 定义**：
   ```bash
   grep -n 'md-heading\|md-h[1-6]' webui/static/style.css
   ```
   如果无结果，确认 CSS 缺失。

3. **检查 computed style**：
   ```js
   var h = document.querySelector('.md-heading');
   var cs = window.getComputedStyle(h);
   cs.fontSize + ' ' + cs.fontWeight + ' ' + cs.marginTop
   ```
   如果 `fontWeight` 为 `400`（非粗体）且 `fontSize` 与正文相同，说明样式未生效。

## 修复

在 `style.css` 中添加 heading 样式：

```css
/* Headings */
.msg-body .md-heading {
  margin: 12px 0 6px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text);
}
.msg-body .md-h1 { font-size: 1.5em; border-bottom: 2px solid var(--border); padding-bottom: 4px; }
.msg-body .md-h2 { font-size: 1.3em; border-bottom: 1px solid var(--border); padding-bottom: 3px; }
.msg-body .md-h3 { font-size: 1.15em; }
.msg-body .md-h4 { font-size: 1.05em; color: var(--text-dim); }
.msg-body .md-h5,
.msg-body .md-h6 { font-size: 1em; color: var(--text-dim); }
```

## 验证

修复后必须硬刷新浏览器（Ctrl+Shift+R），因为 browser tool 有独立 CSS 缓存。

```js
var h = document.querySelector('.md-h3');
var cs = window.getComputedStyle(h);
// 期望: fontWeight=700, fontSize=17.25px, marginTop=12px
cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.marginTop
```

## 常见陷阱

- **heading+table 同行分割**：`###标题 | col1 | col2 |` 格式会被分割为 heading + table。参见 `markdown-table-text-prefix-fix.md`。
- **浏览器默认样式干扰**：`h1`–`h6` 标签有浏览器默认样式，`.md-heading` 的 `margin` 需要显式覆盖。

## 相关参考

- `css-table-border-missing-pitfall.md` — 表格边框缺失（同类 CSS 缺失问题）
- `markdown-table-text-prefix-fix.md` — heading+table 分割逻辑
- `markdown-rendering-fixes.md` — Markdown 渲染修复汇总
