# renderMarkdown i-- 越界陷阱

## 问题

在 `renderMarkdown` 的主循环中，多个 split 操作使用 `i--` + `continue` 来重新处理当前索引：

```javascript
lines.splice(i, 1, part1, part2);
i--;       // ← 当 i=0 时，i 变成 -1
continue;
```

当 split 发生在 `i = 0` 时，`i--` 使 `i = -1`。下一轮循环 `lines[-1]` 是 `undefined`（JS 数组负索引返回 undefined），`line.match(...)` 报错：

```
Cannot read properties of undefined (reading 'match')
```

这会导致整个 renderMarkdown 崩溃，消息不显示，如果崩溃发生在会话历史加载循环中，会导致后续所有消息都不渲染。

## 受影响的代码位置

1. **line 3489** — inline heading split（`text### Title` 模式）
2. **line 3751** — inline ordered list split（`text1.item2.item` 模式）

## 修复

在所有 `i--` 后添加守卫：

```javascript
i--;
if (i < 0) i = 0;
continue;
```

## 调试方法

在 Node.js 中模拟验证：

```javascript
let lines = ['text### Title'];
let i = 0;
const inlineH = lines[i].match(/^(.*?)(\#{1,6}\s*.+)$/);
if (inlineH && inlineH[1].trim() && inlineH[2].trim()) {
  lines.splice(i, 1, inlineH[1].trim(), inlineH[2].trim());
  i--;  // i becomes -1!
  console.log('i after decrement:', i);
  console.log('lines[-1]:', lines[i]);  // undefined!
}
```

## 版本

v20260803o 修复

## 相关

- `references/markdown-inline-heading-split.md` — inline heading split 详解
- `references/markdown-inline-ordered-list-split.md` — inline ordered list split 详解
