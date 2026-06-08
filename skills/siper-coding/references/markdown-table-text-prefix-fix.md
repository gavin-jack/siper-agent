# MD 表格渲染修复 — 表格行前面有文字

## 问题描述

LLM 输出表格时经常在表格前加说明文字，如：

```
你的显卡信息如下：| 项目| 详情 ||------|------|
| **型号** | Intel®Iris®Xe Graphics || **显存**| 1 GB(1,073,741,824 bytes) |
| **驱动版本** |31.0.101.4502 |
```

第一行 `startsWith('|')` 为 false，表格检测被跳过，导致 header 行丢失。

## 根因

`renderMarkdown` 中表格检测条件：
```js
if (line.includes('|') && line.trim().startsWith('|') && !_isSep(line.trim()))
```

当一行包含 `|` 但前面有文字时，`startsWith('|')` 为 false，整行被跳过。

## 修复方案

在表格检测前增加 text-before-table 处理：

```js
// Handle lines with text before table: "some text | col1 | col2 |"
if (line.includes('|') && !line.trim().startsWith('|')) {
  const pipeIdx = line.indexOf('|');
  if (pipeIdx > 0) {
    const beforeText = line.substring(0, pipeIdx).trim();
    const tablePart = line.substring(pipeIdx).trim();
    if (tablePart && _splitTableRowSegments(tablePart).length > 0) {
      // Render the text before the table as a plain line
      if (beforeText) {
        const p = document.createElement('p');
        p.className = 'md-paragraph';
        p.innerHTML = inline(beforeText);
        frag.appendChild(p);
      }
      // Insert the table part to be processed next
      lines.splice(i + 1, 0, tablePart);
      i++;
      continue;
    }
  }
}
```

## `_splitTableRowSegments` 实现

关键：**必须在 `||` 被 normalize 之前调用**。

```js
const _splitTableRowSegments = (line) => {
  const segments = [];
  // Split line by || first (row separator in LLM output), BEFORE normalizing pipes
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
      // Remove trailing separator-only cells (e.g. | h1 | h2 |---|---|)
      // Only filter cells that look like separator dashes (3+ consecutive -),
      // not single "-" which is valid data (e.g. "文件夹 | - | 5月22日")
      const cells = s.split('|').map(c => c.trim()).filter(Boolean);
      const realCells = cells.filter(c => !/^[\\s:]*---[\\s:]*$/.test(c));
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

## 陷阱：`_normalizePipes` 不能包在 `_splitTableRowSegments` 外面

❌ 错误：
```js
const subRows = _splitTableRowSegments(_normalizePipes(line.trim()));
// _normalizePipes 把 || 替换成 |，split('||') 无法分割
```

✅ 正确：
```js
const subRows = _splitTableRowSegments(line.trim());
// _splitTableRowSegments 内部先 split('||')，再 normalize 每个 sub-line
```

同样适用于 look-ahead 部分：
```js
// ❌ 旧代码
const clSegs = _splitTableRowSegments(_normalizePipes(cl.trim()));

// ✅ 新代码
const clSegs = _splitTableRowSegments(cl.trim());
```

## CSS 表格样式

确保 `style.css` 中有 `.md-table` 样式（如果已有重复定义需清理）：

```css
.msg-body .md-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.92em;
  line-height: 1.5;
}
.msg-body .md-table th,
.msg-body .md-table td {
  padding: 6px 12px;
  border: 1px solid var(--border);
  text-align: left;
}
.msg-body .md-table th {
  background: rgba(127,127,140,0.12);
  font-weight: 600;
  color: var(--text);
}
.msg-body .md-table td {
  color: var(--text-dim);
}
.msg-body .md-table tr:nth-child(even) td {
  background: rgba(127,127,140,0.04);
}
```

## 验证方法

1. 修改 core.js 后 `node -c core.js` 验证语法
2. 重启 SiPer 服务
3. 浏览器硬刷新（Ctrl+Shift+R）
4. 发送包含表格的消息验证渲染

## Heading 排除（v0.9.86c+）

当一行以 heading 开头且包含 `|` 时（如 `### 对比参考| 模型| 价格|`），text-before-table 检测会误判。

**修复**：在 text-before-table 检测条件中添加 heading 排除：

```js
if (line.includes('|') && !line.trim().startsWith('|') && !/^#{1,6}\s*/.test(line.trim())) {
  // ... text-before-table 处理
}
```

`!/^#{1,6}\s*/.test(line.trim())` 确保以 `#` 开头的 heading 行不会被误判为 text-before-table。

**典型案例**：
- `### 对比参考| 模型| 输出价格 | 性价比|` → heading+table 粘连，heading 被 text-before-table 拦截
- `---### 降价情况**是的！**|时间|...|` → HR+heading+table 粘连，heading 被 text-before-table 拦截

**验证**（VM 测试）：
```
### 对比参考| 模型| 输出价格 | 性价比|  →  md-h3("对比参考") + md-table ✓
---### 降价情况**是的！**|时间|...|          →  md-hr + md-h3 + md-table ✓
你的显卡信息如下：| 项目| 详情 |                →  md-para + md-table ✓（非 heading 不受影响）
```

## 历史版本

- v0.9.34：初始表格识别修复（分隔行检测、`||` 拆分）
- v0.9.36：`||` 拆分边缘情况
- v0.9.37：`||` 后跟随标题 bug
- v0.9.69：表格行前面有文字 bug + `_splitTableRowSegments` 重构
- v0.9.86c：text-before-table 检测排除 heading 开头行
- v0.9.87b：`-` 数据单元格被误过滤为分隔符（`realCells` 过滤条件从 `/^[\s\-:]+$/` 改为 `/^[\s:]*---[\s:]*$/`）
