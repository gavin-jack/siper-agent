# 全局 CSS th/td 样式覆盖 .md-table 样式

## 现象

`.md-table` 中的表头（`th`）显示为大写（`text-transform: uppercase`）、字体变小（`11px`），与预期样式不符。

## 根因

`style.css` 第 541-543 行定义了全局 `table`/`th`/`td` 样式：

```css
/* Table */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 8px 12px; color: var(--text-dim); font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--border); }
td { padding: 10px 12px; border-bottom: 1px solid rgba(48,54,61,0.5); }
```

这些全局样式会影响**所有** `table` 元素，包括 `.md-table`。虽然 `.msg-body .md-table th` 的样式优先级更高，但某些属性（如 `text-transform`、`font-size`）可能因为 CSS 优先级计算方式而仍然被全局样式影响。

## 诊断方法

```javascript
// 在 browser_console 中执行
var th = document.querySelector('.md-table th');
var cs = window.getComputedStyle(th);
console.log('font-size:', cs.fontSize);        // 期望不是 11px
console.log('text-transform:', cs.textTransform); // 期望不是 uppercase
```

## 修复方向

**方案 A（推荐）**：删除全局 `table`/`th`/`td` 样式，或将其作用域限制在非聊天区域（如设置页面表格）。

**方案 B**：在 `.msg-body .md-table th/td` 中显式覆盖所有可能被全局样式影响的属性：
```css
.msg-body .md-table th {
  font-size: inherit;  /* 或具体值如 14px */
  text-transform: none;
  /* 其他需要覆盖的属性 */
}
```

## 影响范围

- 所有聊天消息中的 `.md-table` 表格
- 不影响设置页面等其他区域的表格

## 版本历史

- v0.9.74 (2026-07-31)：发现全局 th/td 样式覆盖问题
