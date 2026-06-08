# CSS 表格边框缺失陷阱

## 症状

表格底边边框不显示，但其他三边（顶、左、右）正常。

## 根因

```css
/* 陷阱 CSS — 常见于全局 reset 或组件库 */
.msg-body .md-table tr:last-child td { border-bottom: none; }
```

这行 CSS 显式移除了表格最后一行的底边边框，导致表格底部无边框。

## 诊断步骤

1. **检查 computed style**：在 browser_console 中执行：
   ```js
   var t = document.querySelector('table');
   var lastRow = t.querySelectorAll('tr');
   var lastCells = lastRow[lastRow.length-1].querySelectorAll('td');
   var cs = window.getComputedStyle(lastCells[0]);
   cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor
   ```
   如果返回 `0px none ...` 或 `0px solid transparent`，说明被 CSS 规则移除了。

2. **搜索 CSS 文件**：
   ```bash
   grep -rn 'border-bottom.*none' webui/static/style.css
   grep -rn 'last-child.*td' webui/static/style.css
   ```

3. **检查 border-collapse 交互**：`border-collapse: collapse` 合并相邻边框。`td { border: 1px solid }` 四边边框 + `tr:last-child td { border-bottom: none }` = 底边消失。

## 修复

```css
/* 修复前 */
.msg-body .md-table tr:last-child td { border-bottom: none; }

/* 修复后 — 保持与其他边框一致 */
.msg-body .md-table tr:last-child td { border-bottom: 1px solid var(--border); }
```

## 相关 CSS 属性交互

| 属性 | 作用 | 陷阱 |
|------|------|------|
| `border-collapse: collapse` | 合并相邻边框 | 最后一行 `border-bottom: none` 导致底边消失 |
| `border: 1px solid var(--border)` | 四边边框 | 优先级低于更具体的 `tr:last-child td` 规则 |
| `var(--border)` | CSS 变量 | 未定义时回退到 `currentColor`，可能不可见 |

## 验证

修复后必须硬刷新浏览器（Ctrl+Shift+R），因为 browser tool 有独立 CSS 缓存。
