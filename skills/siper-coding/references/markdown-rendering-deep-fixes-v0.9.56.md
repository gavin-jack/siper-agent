# Markdown 渲染深度修复（v0.9.56+）

## 问题：混合格式表格渲染失败

LLM 输出常混合多种格式：
```
text | header1 | header2 |    ← 段落+表格头混合一行
|---|---|---|                    ← separator（单独一行）
                                 ← 空行
col1\tcol2\tcol3                 ← Tab 分隔数据行（无 | 分隔符）
```

标准 Markdown 渲染器无法处理这种混合格式。

## 修复方案：预处理三件套

### 1. Tab → Pipe 转换（预处理阶段）

在 renderMarkdown 的预处理块中，**在分割混合行之前**，先将 Tab 分隔行转换为 pipe 格式：

```javascript
// 检测：有 Tab、无 |、非列表/标题/引用、2+ 列、相邻行也有 Tab
if (l.includes('\t') && !l.includes('|') && !l.trim().startsWith('#') && 
    !l.trim().startsWith('-') && !l.trim().startsWith('*') && 
    !/^\d+\.\s/.test(l.trim()) && !l.trim().startsWith('>')) {
  const _tabColCount = (s) => s.split('\t').filter(c => c.trim()).length;
  if (_tabColCount(l) >= 2) {
    const prevHasTab = li > 0 && lines[li-1].includes('\t') && !lines[li-1].includes('|') && _tabColCount(lines[li-1]) >= 2;
    const nextHasTab = li+1 < lines.length && lines[li+1].includes('\t') && !lines[li+1].includes('|') && _tabColCount(lines[li+1]) >= 2;
    if (prevHasTab || nextHasTab) {
      const cells = l.split('\t').map(c => c.trim()).filter(Boolean);
      expanded.push('| ' + cells.join(' | ') + ' |');
      continue;
    }
  }
}
```

**关键细节**：
- 用 `/^\d+\.\s/` 而非 `/^\d+\./` 排除有序列表——`111.png` 以数字开头但不是列表
- 检查相邻行确认是表格（避免误转 tab 缩进的普通文本）

### 2. text|table| 分割（预处理阶段）

当一行包含 `|` 且前面有文本时，分割为独立行：

```javascript
if (!l.trim().startsWith('|') && l.includes('|')) {
  const firstPipe = l.indexOf('|');
  if (firstPipe > 0) {
    const beforePipe = l.substring(0, firstPipe).trim();
    const afterFirstPipe = l.substring(firstPipe);
    const pipeCount = (afterFirstPipe.match(/\|/g) || []).length;
    // 前面有文本 + 后面有 2+ 个 |（至少 2 列）才分割
    if (beforePipe.length > 0 && pipeCount >= 2) {
      splits.push(firstPipe);
    }
  }
}
```

### 3. 表格检测跳过空行

**Context 检查**（决定是否是表格）：
```javascript
// 跳过空行查找相邻表格内容
let _ni = i + 1; while (_ni < lines.length && lines[_ni].trim() === '') _ni++;
let _pi = i - 1; while (_pi >= 0 && lines[_pi].trim() === '') _pi--;
const nextLine = _ni < lines.length ? lines[_ni] : '';
const prevLine = _pi >= 0 ? lines[_pi] : '';
```

**Lookahead 收集**（收集所有表格行）：
```javascript
// 跳过空行和 separator 行
if (cl.trim() === '') { j++; continue; }
if (cl.includes('|') && cl.trim().startsWith('|')) {
  if (_isSep(cl)) { j++; continue; }
  // ... 收集行
}
```

### 4. Bold 片段跨行合并（预处理阶段）

LLM 输出常将 `**bold**` 打断成多行：
```
**
content
more**
```

或：
```
**content
more
**
```

**Case 1**：`**` 单独一行 → 收集后续行直到找到闭合 `**`
**Case 2**：行以 `**` 开头但不以 `**` 结尾 → 收集直到闭合 `**`

```javascript
const _boldAlone = /^\s*\*\*\s*$/.test(l);
const _boldOpen = l.trimStart().startsWith('**') && !l.trimEnd().endsWith('**');
if (_boldAlone || _boldOpen) {
  const boldLines = [];
  let found = false;
  const startLi = li;
  if (_boldOpen) {
    const firstContent = l.trimStart().substring(2);
    if (firstContent.trim()) boldLines.push(firstContent.trim());
    li++;
  } else if (_boldAlone) {
    li++; // skip the ** line itself
  }
  for (let ni = li; ni < lines.length && ni <= startLi + 10; ni++) {
    const closeIdx = lines[ni].lastIndexOf('**');
    if (closeIdx >= 0) {
      boldLines.push(lines[ni].substring(0, closeIdx));
      const content = boldLines.join(' ').replace(/\s+/g, ' ').trim();
      expanded.push('**' + content + '**');
      const after = lines[ni].substring(closeIdx + 2).trim();
      if (after) expanded.push(after); // ** 后的普通文本单独成行
      li = ni;
      found = true;
      break;
    } else {
      boldLines.push(lines[ni]);
    }
  }
  if (found) continue;
  li = startLi; // 没找到闭合 **，当作普通文本
}
```

## 调试技巧

1. **在浏览器控制台模拟预处理**：复制预处理逻辑到 console，验证 expanded 输出
2. **检查 Tab 转换**：`lines[i].includes('\t')` 确认 Tab 存在
3. **检查 pipeCount**：`afterFirstPipe.match(/\|/g).length` 确认列数
4. **验证 bold 合并**：检查 `expanded` 中是否有 `**...**` 完整标记

## 关联修复

- Tab 表格检测（主循环中的 `_tabColCount`）仍需保留，作为 fallback
- Tab 表格的 context 检查和收集循环也需跳过空行（同上）
