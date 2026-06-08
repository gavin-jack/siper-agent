# 表格行尾粘连文字修复（v=20260523k）

## 问题

LLM 输出中，表格最后一行与后续文字之间没有换行符时，粘连文字被当作表格最后一个单元格的内容。

```
| `hermes-memory-backup` | 文件夹| - |还有几个临时文件
```

`"还有几个临时文件"` 被错误地作为单元格内容渲染。

## 根因

1. 表格 look-ahead 逻辑检查 `cl.includes('|') && cl.trim().startsWith('|')`，粘连行满足条件，被当作表格行处理
2. look-ahead 从 header 行扫描到粘连行，`i = j` 跳过了所有行，粘连行未被拆分

## 修复（两处）

### 1. look-ahead 中停止粘连行

在表格 look-ahead 的 `if (cl.includes('|') && cl.trim().startsWith('|'))` 块内，`_isSep` 检查之前添加：

```javascript
if (!cl.trim().endsWith('|')) break;
```

### 2. TRAILING_TBL 检测（表格处理之前）

```javascript
if (line.trim().startsWith('|') && !line.trim().endsWith('|')) {
  const trimmed = line.trim();
  let trailPipe = -1;
  for (let p = trimmed.length - 1; p >= 0; p--) {
    if (trimmed[p] === '|' && !trimmed.substring(p + 1).includes('|')) {
      trailPipe = p; break;
    }
  }
  if (trailPipe > 0) {
    const trailingText = trimmed.substring(trailPipe + 1).trim();
    const tablePart = trimmed.substring(0, trailPipe + 1).trim();
    if (tablePart && trailingText) {
      lines.splice(i, 1, tablePart, trailingText);
      continue;  // 不 i--，让 i 指向 tablePart
    }
  }
}
```

## 关键陷阱

1. **不 `i--`**：`splice` 后 `i` 指向 `tablePart`。如果 `i--`，会重复处理已在 look-ahead 中处理过的前一行。
2. **多余的 `}` 导致语法错误**：修改时可能引入多余闭合括号，`node -c` 报 "Illegal continue statement"。用深度计数法排查。
3. **VM 测试 `\n` 陷阱**：`join('\n')` 产生真正换行符，`join('\\n')` 产生字面量。测试输入必须用真正换行符。

## 深度计数法排查语法错误

```javascript
var depth = 0;
for (var i = 0; i < lines.length; i++) {
  depth += (lines[i].match(/{/g)||[]).length - (lines[i].match(/}/g)||[]).length;
  if (depth < 0) { console.log('Extra } at line', i+1); break; }
}
```

## 验证用例

输入: `"|文件名 | 类型| 大小 |\n|--------|------|------|\n| 程序 | 文件夹| - |\n| hermes-memory-backup | 文件夹| - |还有几个临时文件"`

期望: md-table(程序行) + md-table(hermes行) + md-para("还有几个临时文件")
