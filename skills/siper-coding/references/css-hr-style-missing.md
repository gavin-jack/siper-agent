# `.md-hr` CSS 样式缺失导致 HR 不可见

## 问题描述

`core.js` 的 `renderMarkdown` 遇到 `---` 时会正确创建 `<hr class="md-hr">` 元素，但 `style.css` 中**完全没有** `.md-hr` 的样式定义，导致：

- `<hr>` 元素没有边框、没有高度、没有间距
- 视觉上完全不可见
- 用户看到"表格结束后没有换行"或"标题直接跟在表格后面"

## 诊断方法

```javascript
// browser_console 中执行
var hr = document.querySelector('.md-hr');
if (hr) {
  var cs = window.getComputedStyle(hr);
  console.log('borderTop:', cs.borderTop);  // 期望: "1px solid rgb(...)"，实际: "0px none"
  console.log('margin:', cs.marginTop, cs.marginBottom);  // 期望: "10px"，实际: "0px"
}
```

## 修复方案

在 `style.css` 的 `/* Headings */` 区块之后添加：

```css
/* Horizontal rule */
.msg-body .md-hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
```

## 相关上下文

- HR 检测在 `core.js` 第 2965 行：`if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim()))`
- `---###` 或 `--- ###` 同行情形已在预处理阶段分割为独立 HR + 标题行（v0.9.76）
- 修复后需硬刷新浏览器（Ctrl+Shift+R）

## 历史

- v0.9.77 首次发现并修复
