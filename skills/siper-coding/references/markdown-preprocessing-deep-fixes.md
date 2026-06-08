# Markdown 预处理深度修复

## 行内代码保护预处理（v0.9.65+）

### 问题

`renderMarkdown` 预处理阶段会将"连在一起的 Markdown 元素"分割成多行。无序列表分割正则 `/(?<=\S)(?=-[^\s-])/g` 会在任意非空白字符后遇到 `-` 时分割，但它没有排除**行内代码**（backtick 包裹的内容）内部的情况。

**典型错误**：`` `- `hermes-memory-backup/\`` `` 被错误分割为三行：
- `` `- `hermes` ``
- `` `-memory` ``
- `` `-backup/` ``

### 根因

预处理分割时，backtick 还未被 `inline()` 函数保护（`inline` 在逐行处理时才调用），所以分割正则直接作用于原始文本，误伤代码内部含连字符的内容。

### 修复

在进行任何分割正则匹配之前，先将行内代码 span 替换为占位符：

```js
const codeSpans = [];
l = l.replace(/`([^`]+)`/g, (_, c) => {
  codeSpans.push(c);
  return '\x00P' + (codeSpans.length - 1) + '\x00';
});
```

分割完成后再还原：

```js
if (parts.length > 1) {
  expanded.push(...parts.map(p =>
    p.replace(/\x00P(\d+)\x00/g, (_, i) => '`' + (codeSpans[parseInt(i)] || '') + '`')
  ));
} else {
  expanded.push(l.replace(/\x00P(\d+)\x00/g, (_, i) => '`' + (codeSpans[parseInt(i)] || '') + '`'));
}
```

### 注意

- `codeSpans` 数组必须在 `for` 循环内部声明（每行独立）
- 占位符格式 `\x00P{N}\x00` — 必须用 `\x00P` 不能用 `\x00C`，否则与 `inline()` 内部占位符冲突
- 无分割路径也必须还原占位符

---

## text | table | 混合行分割（v0.9.56+，v0.9.69 扩展）

### 问题

LLM 输出中，表格行前面可能有文字描述：

```
你的显卡信息如下：| 项目 | 详情 ||------|------|
```

主循环检测表格时要求 `line.trim().startsWith('|')`，导致这种混合行被跳过。

### 解决方案

在主循环中、表格检测之前，增加 text-before-table 检测：

```js
if (line.includes('|') && !line.trim().startsWith('|')) {
  const pipeIdx = line.indexOf('|');
  if (pipeIdx > 0) {
    const beforeText = line.substring(0, pipeIdx).trim();
    const tablePart = line.substring(pipeIdx).trim();
    // Validate: >= 3 pipes (2+ columns) or contains ||
    const pipeCount = (tablePart.match(/\|/g) || []).length;
    if (tablePart && (pipeCount >= 3 || tablePart.includes('||')) && _splitTableRowSegments(tablePart).length > 0) {
      if (beforeText) {
        const p = document.createElement('p');
        p.className = 'md-paragraph';
        p.innerHTML = inline(beforeText);
        frag.appendChild(p);
      }
      lines.splice(i + 1, 0, tablePart);
      i++;
      continue;
    }
  }
}
```

### 关键细节

1. **pipeCount >= 3**：避免 `Use the | character` 被误判为表格
2. **预处理已保护行内代码**：`\x00P` 占位符替换了行内代码，`|` 不会被误计
3. **`lines.splice` 插入**：表格部分插入下一行，`continue` 跳过当前迭代
4. **必须在预处理之后执行**：确保行内代码已被保护

### `_splitTableRowSegments` 实现

```js
const _splitTableRowSegments = (line) => {
  const segments = [];
  const subLines = line.trim().split('||');
  for (const sl of subLines) {
    const t = sl.trim();
    if (!t) continue;
    let s = t;
    if (!s.startsWith('|')) s = '| ' + s;
    if (!s.endsWith('|')) s = s + ' |';
    if (_isSep(s)) {
      segments.push('__sep__');
    } else {
      const cells = s.split('|').map(c => c.trim()).filter(Boolean);
      const realCells = cells.filter(c => !/^[\s\-:]+$/.test(c));
      if (realCells.length > 0) {
        segments.push('| ' + realCells.join(' | ') + ' |');
      } else {
        segments.push('__sep__');
      }
    }
  }
  return segments;
};
```

**注意**：不能在调用前用 `_normalizePipes` 替换 `||` → `|`，否则行分隔符丢失。

---

## Tab → pipe 预处理转换（v0.9.56+）

预处理阶段最先执行：相邻 Tab 分隔行（2+ 列）自动转换为 `| col1 | col2 |` 格式。

排除条件：`!/^\d+\.\s/`（避免 `111.png` 被误判为有序列表）。

---

## 表格检测跳过空行（v0.9.56+）

context 检查和 lookahead 收集循环都必须跳过空行，否则 header-separator-data 被隔断。

---

## Bold 跨行合并（v0.9.56+）

检测 `**` 单独一行或行以 `**` 开头但未闭合，收集直到闭合 `**`。
