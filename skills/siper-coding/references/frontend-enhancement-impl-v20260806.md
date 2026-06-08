# 前端炫酷升级实施细节 v20260806

## 可拖拽面板

### Sidebar Resize Handle
```css
.sidebar-resize-handle {
  position: absolute; right: 0; top: 0; bottom: 0;
  width: 4px; cursor: col-resize; z-index: 200;
}
```
- mousedown 记录 startX + startWidth
- mousemove 计算 dx，`Math.max(120, Math.min(400, startWidth + dx))`
- 更新 `--sidebar-width` CSS 变量 + sidebar.style.width/minWidth

### Sidebar Collapse
- 按钮 `.sidebar-collapse-btn` 绝对定位在 sidebar 右侧外部（right: -14px）
- `classList.toggle('collapsed')` + `localStorage.setItem('sidebarCollapsed', collapsed)`
- `.sidebar.collapsed` → `width: 0 !important; min-width: 0 !important; overflow: hidden`
- `.main.expanded` → `margin-left: 0`

## 思维链可视化 (CoT Tree)

### 数据结构
```js
// tool_call_steps 中每个 step 的结构
{ tool_name, status: 'running'|'done'|'error'|'pending', duration, result }
```

### 渲染函数
`renderCotTree(steps)` 在 core.js 中定义，返回 HTML 字符串：
- `.cot-tree` > `.cot-tree-title`（🧠 思维链）+ 多个 `.cot-step`
- `.cot-step-dot` 有 4 种状态 class：running（脉冲动画）、done（绿）、error（红）、pending（灰）
- `.cot-step-name` + `.cot-step-detail` + `.cot-step-time`

### 插入位置
在 `appendMeta()`（page-chat.js）中，在 `renderToolCalls()` 之前插入：
```js
const cotHtml = renderCotTree(steps);
if (cotHtml) {
  const cotWrap = document.createElement('div');
  cotWrap.innerHTML = cotHtml;
  cotWrap.style.display = 'none';
  cotWrap.className = 'cot-tree-wrap';
  container.appendChild(cotWrap);
}
```
CoT 树和 tool calls panel 都默认隐藏，通过同一个 `.meta-tools-link` toggle。

## 代码高亮 (Prism.js)

### CDN 加载（index.html </body> 前）
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css">
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
<!-- ... 其他语言组件 -->
```

### renderMarkdown 修改
code 元素添加语言 class：
```js
const code = document.createElement('code');
if (lang) code.className = 'language-' + lang;
```

### enhanceCodeBlocks 跳过条件
```js
// renderMarkdown 直接给 pre.className = 'md-code-block'（不是 wrapper div）
if (pre && pre.classList && (pre.classList.contains('md-code-block') || 
    (pre.parentElement && pre.parentElement.classList.contains('md-code-block')))) return;
```

## Mermaid 图表

### renderMarkdown 特殊处理
```js
if (lang === 'mermaid') {
  const mermaidDiv = document.createElement('div');
  mermaidDiv.className = 'mermaid-container';
  mermaidDiv.innerHTML = '<div class="mermaid">' + escapeHtml(allCodeLines) + '</div>';
  frag.appendChild(mermaidDiv);
  continue;  // 跳过正常 code block 创建
}
```

### renderMermaid 函数
处理两种来源：
1. `code.language-mermaid` 元素（enhanceCodeBlocks 路径）
2. `.mermaid-container .mermaid` 元素（renderMarkdown 直接创建路径）

使用 `window.mermaid.render(mermaidId, src)` 异步渲染 SVG。

### Mermaid 初始化（DOMContentLoaded 末尾）
```js
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'inherit' });
}
```

## KaTeX 公式

### CDN 加载
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
```

### renderKatex 函数
```js
renderMathInElement(container, {
  delimiters: [
    {left: '$$', right: '$$', display: true},
    {left: '$', right: '$', display: false},
    {left: '\\\\(', right: '\\\\)', display: false},
    {left: '\\\\[', right: '\\\\]', display: true}
  ],
  throwOnError: false
});
```

## postRenderEnhance 钩子

### 调用位置
1. **addMsg() 末尾**（page-chat.js）：`if (isAgent) { const bodyEl = row.querySelector('.msg-body'); if (bodyEl) postRenderEnhance(bodyEl); }`
2. **stream_end 处理末尾**（core.js）：`if (_streamBubble) postRenderEnhance(_streamBubble);`

### 函数实现
```js
window.postRenderEnhance = function(container) {
  if (!container) return;
  enhanceCodeBlocks(container);  // Prism 高亮
  renderMermaid(container);      // Mermaid 图表
  renderKatex(container);        // KaTeX 公式
};
```

## 关键陷阱

1. **renderMarkdown code block 结构**：pre 直接有 `md-code-block` class，不是 wrapper div。enhanceCodeBlocks 跳过条件要检查 pre 本身。
2. **appendMeta 位置**：定义在 page-chat.js，不是 core.js。
3. **Mermaid 渲染异步**：`mermaid.render()` 返回 Promise，需要 `.then()` 处理。
4. **CDN 加载顺序**：Prism 主题 CSS → Prism core → 语言组件；KaTeX CSS → KaTeX core → auto-render。
5. **cache-buster**：修改 core.js 后必须更新 index.html 中的 `?v=` 版本号。
6. **⚠️ Sidebar 内部元素被 overflow:hidden 裁剪（血泪教训）**：
   - 当 sidebar 折叠（width:0, overflow:hidden）时，内部 absolute/fixed 元素会被裁剪，导致点击无效
   - **解决方案**：把 collapse 按钮和 resize handle 移到 sidebar **外部**（HTML 中 `</div>` 之后），使用 `position: fixed` + CSS 变量 `--sidebar-width` 动态定位
   - CSS 用 `.sidebar.collapsed ~ .sidebar-collapse-btn` 兄弟选择器控制折叠状态
   - JS 拖拽时同步更新 handle.style.left 和 btn.style.left
   - 初始化时根据 sidebar.offsetWidth 设置 handle 和 btn 的初始位置
7. **⚠️ 添加闭合括号前必须验证现有结构**：
   - 本次事故：renderMarkdown 函数已在 3808 行正确关闭，我又添加了一个 `}` 导致语法错误
   - 然后又添加了一个 `}` "修复"，导致 4003 行出现多余 `}`，node -c 报错
   - **正确做法**：先用 brace-counting 或 node -c 确认现有结构，再决定是否需要添加括号
8. **⚠️ browser_console 返回 stale 结果**：
   - 连续调用相同 query 时，browser_console 返回相同结果并附带 warning
   - 不要重复调用相同表达式，改用不同 query 或先 navigate 刷新
9. **⚠️ browser_navigate 已返回 compact snapshot**：
   - 不需要在 navigate 后再调用 browser_snapshot，除非页面状态已改变
10. **⚠️ JS 函数全部 undefined 的调试方法**：
    - 如果 `typeof window.xxx === 'undefined'` 对所有函数都成立，说明 JS 文件没有完全执行
    - 可能原因：IIFE 前面的函数缺少闭合括号，导致后续代码被包含在已 return 的函数体内
    - `node -c` 可能通过（语法正确），但运行时函数不会被执行
    - 诊断：在浏览器中 `document.querySelector('.sidebar')` 返回 null = DOM 还没加载或 JS 崩溃
    - 修复：检查 IIFE 前所有函数的大括号匹配，特别是 `return` 语句后的闭合括号
11. **⚠️ toggleSidebarCollapse 必须更新 CSS 变量**：
    - 只 `classList.toggle('collapsed')` 不够，必须同步更新 `--sidebar-width` CSS 变量
    - 否则按钮的 `left: var(--sidebar-width)` 不会跟着移动
    - 同时需要更新 `btn.style.left` 和 `handle.style.left`
