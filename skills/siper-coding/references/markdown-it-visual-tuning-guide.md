# markdown-it 渲染效果调优指南

## 问题描述

用户反馈 markdown-it 14.x 替换手写 renderMarkdown 后，以下格式视觉效果不如之前：
- **行内代码** (`code`) — 背景色、字体、padding 可能不对
- **代码块** (`pre`) — 背景、圆角、padding 可能不对
- **表格** — 边框、间距、颜色有问题
- **标题** — 字号、间距不对

## 根因分析

markdown-it 14.x 生成的 HTML 是标准标签，没有自定义 CSS 类名。CSS 选择器已从 `.md-*` 类名改为标签选择器。

**关键问题**：浏览器默认样式对 `<code>`、`<pre>`、`<table>`、`<h1>`~`<h6>` 等标签有内置 margin/padding/font，标签选择器需要显式覆盖这些默认值。

## CSS 调优检查清单

当用户说"不如之前好看"时，按以下顺序检查：

### 1. 行内代码
```css
.msg-body .md-code-inline {
  background: rgba(127,127,140,0.18);
  color: var(--accent2, #e879f9);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.88em;
  white-space: nowrap;
}
```

### 2. 代码块
```css
.msg-body pre {
  position: relative;
  background: var(--bg-card, #1a1f2e);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
}
.msg-body pre code {
  display: block;
  padding: 12px 14px;
  padding-top: 28px;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  margin: 0;
}
```

### 3. 表格
```css
.msg-body table {
  margin: 8px 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
```

### 4. 标题
```css
.msg-body h1, .msg-body h2, .msg-body h3, .msg-body h4, .msg-body h5, .msg-body h6 {
  margin: 10px 0 6px 0;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text);
}
```

## 历史教训

1. 不要假设标签选择器和类名选择器效果一致 — 浏览器默认样式对标签有预设
2. 显式覆盖所有相关属性 — 不要依赖继承或默认值
3. 特别关注 code、pre、table、h1~h6 — 这些标签的浏览器默认样式最多
4. 修改后必须让用户截图确认 — browser tool 截图无法被模型分析（区域限制 403）
5. 用户说"不如之前好看"时：不要追问让用户描述，直接对比旧版 CSS 属性值找差异并修复
