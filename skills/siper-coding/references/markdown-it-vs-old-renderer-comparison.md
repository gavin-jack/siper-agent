# markdown-it vs 手写 renderMarkdown 渲染效果对比

## 背景（v0.9.59）

SiPer 从手写 regex renderMarkdown（~417 行）切换到 markdown-it 14.1.0 + 适配器（~70 行）。
用户反馈：markdown-it 渲染效果不如之前手写版本好看，特别是：
- 行内代码 (`code`) — 背景色、字体、padding
- 代码块 (`pre`) — 背景、圆角、padding
- 表格 — 边框、间距、颜色

## 核心差异

| 元素 | 旧版（手写） | 新版（markdown-it） |
|------|------------|-------------------|
| CSS 选择器 | `.md-code-inline`, `.md-code-block`, `.md-table` 等类名 | 标签选择器 `code`, `pre`, `table` |
| 行内代码 | `<code class="md-code-inline">` 带背景色+padding | `<code class="md-code-inline">`（需 renderer hook） |
| 代码块 | `<div class="md-code-block"><code>` | `<pre><code>`（markdown-it 原生输出） |
| 表格 | `<table class="md-table">` | `<table>`（无类名） |

## 调试方法

1. **对比 CSS 属性**：逐个比对 `.msg-body pre` vs 旧版 `.msg-body .md-code-block` 的 padding、margin、background-color、border-radius
2. **对比 HTML 结构**：旧版代码块是 `<div class="md-code-block"><code>`，新版是 `<pre><code>`，CSS 选择器需要适配
3. **browser_console 无法测试**：browser_console 不加载页面脚本，`renderMarkdown` 为 undefined。必须用真实浏览器硬刷新验证
4. **截图对比**：在真实浏览器中分别截取相同 Markdown 内容的渲染效果

## 已知问题

- markdown-it 14.x 的 renderer rules 只有 9 个，无法给 table/heading/list 等添加 CSS 类名
- CSS 已改为标签选择器，但视觉效果可能与旧版有差异
- 用户偏好：简洁直接，不喜欢花哨效果

## 修复优先级

1. 先对比旧版 CSS 属性值
2. 调整标签选择器 CSS 使其接近旧版效果
3. 不要退回手写 regex 方案
