# 表格后换行/间距缺失（v0.9.75+）

## 现象

用户说"表格结束要换行"，表格和下一个段落之间没有视觉间距，看起来连在一起。

## 根因

1. `.md-table` 的 `margin` 是 `8px 0`（上下对称，无额外底部间距）
2. `.md-para` 的 `margin-top` 为 `0`
3. 表格后的空行在渲染器中被吞掉（`i++; continue;` 无元素创建）

## 诊断

```js
// browser_console 中执行
var tables = document.querySelectorAll('.md-table');
var lastTable = tables[tables.length - 1];
var cs = window.getComputedStyle(lastTable);
console.log('table margin-bottom:', cs.marginBottom);  // 如果是 '0px' 说明有问题

var nextP = lastTable.nextElementSibling;
if (nextP && nextP.tagName === 'P') {
  var pcs = window.getComputedStyle(nextP);
  console.log('next p margin-top:', pcs.marginTop);  // 如果是 '0px' 说明有问题
}
```

## 修复

**style.css** 三处修改：

```css
/* 1. 表格底部增加间距 */
.msg-body .md-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 12px 0;  /* 原来是 8px 0 */
  font-size: 0.92em;
  line-height: 1.5;
}

/* 2. 最后一个表格不需要底部间距 */
.msg-body .md-table:last-child {
  margin-bottom: 0;
}

/* 3. 段落顶部增加间距 */
.msg-body .md-para { margin: 4px 0 6px 0; line-height: 1.6; }  /* 原来是 0 0 6px 0 */
```

## 验证

修改后硬刷新浏览器（Ctrl+Shift+R），检查：
- `window.getComputedStyle(table).marginBottom === '12px'`
- `window.getComputedStyle(nextP).marginTop === '4px'`
- 最后一个表格 `marginBottom === '0px'`

## 注意事项

- 用户说"换行"通常是指视觉间距，不是 HTML `<br>`
- 表格后的空行在 MD 渲染器中不创建任何元素（空行只是段落分隔标记）
- 间距完全由 CSS margin 控制
