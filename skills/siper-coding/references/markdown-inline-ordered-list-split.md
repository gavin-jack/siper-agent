# 行内有序列表分割 — text1.item2.item3 模式

## 问题

LLM 输出中有序列表项经常粘连在同一行，无换行：

```
建议尝试1.刷新页面-重新加载对话2.清除缓存-清除浏览器或应用缓存3.切换设备/客户端-看是否同样问题---
```

旧有序列表检测 `/^\d+\.\s*/` 只匹配行首的数字+点，导致整行被当作普通段落。

## 修复

在有序列表检测之后、空行检测之前，添加行内有序列表分割逻辑：

```javascript
// Inline ordered list split: "text1. item2. item3. item" → split into separate lines
// Only triggers when line does NOT start with a number (that's handled by ordered list above)
// Splits on boundary between non-space char and "N. " pattern (N = digit, space after dot)
if (!/^\d+\./.test(line.trim())) {
  // Find all "N." patterns (N = 1+ digits, preceded by non-digit)
  // Filter out matches at position 0
  const matches = [];
  const re = /(?<!\d)(\d+)\./g;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > 0) matches.push(m);
  }
  if (matches.length >= 2) {
    const parts = [];
    let prev = 0;
    for (const mm of matches) {
      if (mm.index > prev) {
        parts.push(line.substring(prev, mm.index).trim());
      }
      prev = mm.index;
    }
    parts.push(line.substring(prev).trim());
    const validParts = parts.filter(p => p);
    if (validParts.length >= 2) {
      lines.splice(i, 1, ...validParts);
      i--;
      continue;
    }
  }
}
```

## 关键设计决策

### 为什么用 `(?<!\d)` 而不是直接匹配 `\d+\.`？

避免匹配多位数字中的部分（如 `12.` 中的 `2.`）。`(?<!\d)` 确保匹配的数字前面不是数字。

### 为什么要求 `matches.length >= 2`？

单个 `\d+\.` 可能是普通文本中的数字（如 `version 2.0`），不一定是列表项。2+ 个才认为是列表。

### 为什么要求 `m.index > 0`？

行首的 `\d+\.` 已经被有序列表检测处理了，这里只处理行中间的。

### 分割后 trailing text 的处理

`3.切换设备/客户端-看是否同样问题---` 中的 `---` 会保留在最后一个列表项中。这是因为 `---` 和列表项粘连，无法自动分割。这种情况较少见，可以接受。

## 关键陷阱：i-- 导致 i = -1

当 inline ordered list split 在 `i = 0` 处执行时，`lines.splice(0, 1, ...)` 后 `i--` 使 `i = -1`。
下一轮循环 `lines[-1]` 是 `undefined`，`line.match(...)` 报错 `Cannot read properties of undefined (reading 'match')`。

**修复**：`i--` 后添加 `if (i < 0) i = 0;`

```javascript
lines.splice(i, 1, ...validParts);
i--;
if (i < 0) i = 0;  // ← 必须添加
continue;
```

**同样适用于 inline heading split**（line 3489 的 `i--` 也有同样问题）。

## 边界情况

| 输入 | 拆分结果 | 说明 |
|------|---------|------|
| `建议尝试1.刷新页面2.清除缓存3.切换设备` | `建议尝试` + `1.刷新页面` + `2.清除缓存` + `3.切换设备` | 正常拆分 |
| `text1. one2. two3. three` | `text` + `1. one` + `2. two` + `3. three` | 正常拆分 |
| `1. normal list` | 不拆分 | 行首数字，走有序列表检测 |
| `version 2.0 release` | 不拆分 | 只有 1 个 `\d+\.` |
| `12. item` | 不拆分 | `(?<!\d)` 阻止 `2.` 被匹配 |

## 执行顺序

1. 有序列表检测（行首 `\d+\.`）
2. **行内有序列表分割**（新增）
3. 空行检测
4. 树形结构检测
5. 段落渲染

## 版本

v20260803m：初始实现
