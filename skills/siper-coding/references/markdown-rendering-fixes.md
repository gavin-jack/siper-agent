# Markdown 渲染修复（v0.9.34+）

## 段落换行

**问题**：`paraLines.join(' ')` 会丢失段落内换行。

**修复**：
```js
// ❌ 错误
p.innerHTML = inline(paraLines.join(' '));

// ✅ 正确
p.innerHTML = inline(paraLines.join('\n')).replace(/\n/g, '<br>');
```

注意：`inline()` 会 escape HTML，所以不能在 join 中直接用 `<br>`，需要在 inline 之后 replace。

## 表格识别

### 标准格式

```
| 列1 | 列2 | 列3 |
|------|------|------|
| A | B | C |
```

### `||` 行分隔符（v0.9.35+）

**关键**：`||` 是**行分隔符**（一行里多个表格行），不是列分隔符。

```
|OpenClaw（推荐）| 3分钟完成... || HermesAgent | MCP接入...
```

应拆成两行：
- `|OpenClaw（推荐）| 3分钟完成... |`
- `| HermesAgent | MCP接入... |`

**实现**：
```js
const rawRows = line.split('||').map(s => s.trim()).filter(Boolean);
const subRows = rawRows.map(r => {
  let s = r.trim();
  if (!s.startsWith('|')) s = '| ' + s;
  if (!s.endsWith('|')) s = s + ' |';
  return s;
});
```

### 分隔行跳过（v0.9.35+）

`|---|---|` 是纯格式行，必须跳过不加入 tableRows，但也不能 break（要继续向后扫描）。

```js
const _isSep = (s) => /^\s*\|?[\s\-:|]+\|?\s*$/.test(s) && s.includes('-');

// 跳过分隔行但不 break
if (_isSep(cl)) { j++; continue; }
```

### 检测条件

```js
// 标准表格行：以 | 开头和结尾
const isStandard = line.trim().startsWith('|') && line.trim().endsWith('|');

// 紧凑表格行（|| 分隔）：包含 || 且不以 | 开头
const isCompact = /\| \|/.test(line) && !line.trim().startsWith('|');
```

## Text-Before-Table 混合行（v0.9.69+）

**问题**：LLM 输出中表格行前有文字描述，如 `你的显卡信息如下：| 项目 | 详情 ||------|------|`，`startsWith('|')` 检测失败。

**解决方案**：主循环中表格检测前增加 text-before-table 分割，详见 `references/markdown-preprocessing-deep-fixes.md` 的 "text | table | 混合行分割" 章节。

**关键验证条件**：`pipeCount >= 3 || tablePart.includes('||')`，避免普通含 `|` 文本被误判。

## `||` 后跟随标题的 Bug（v0.9.37+）

### 问题

当行内包含 `||` 但不是表格时（如普通段落中的 `||`），会被错误拆分成表格行。

**示例**（用户报告）：
```
|**OpenClaw（推荐）**| 3分钟完成... || **HermesAgent** | MCP接入...
```

这行有 `|` 也有 `||`，但 `||` 两侧的内容格式不对称（左侧有 `**粗体**` 包裹 `|`，右侧没有），导致拆分后格式错乱。

### 修复策略

1. **严格检测**：只有当行中 `||` 两侧都符合 `|...|` 表格格式时才拆分
2. **不对称保护**：如果 `||` 两侧的 `|` 数量不一致，不拆分，当作普通文本
3. **段落排除**：如果行不以 `|` 开头且不含表格特征，直接作为段落处理

```js
// ✅ 安全的 || 拆分检测
function _hasValidCompactTable(line) {
  if (!line.includes('||')) return false;
  // 整行必须主要由 | 和 || 组成（表格特征）
  const pipeCount = (line.match(/\|/g) || []).length;
  const doublePipeCount = (line.match(/\|\|/g) || []).length;
  // 至少 3 个单 | 且至少 1 个 ||
  return pipeCount >= 3 && doublePipeCount >= 1;
}
```

### 标题渲染问题

`# 标题` 可能被 `renderMarkdown` 的段落逻辑吞掉。确保：
- `# ` 开头的行被识别为 heading，不进入段落合并
- `## ` ~ `###### ` 同理
- heading 级别通过 match 捕获

### 段落渲染问题

- 段落中的 `|` 字符不应触发表格检测
- 段落换行已在 v0.9.34 修复（`<br>` 替换）
- 如果段落首行含 `|` 但不是表格格式，需要确保 `isStandard` 检测不会误判

```js
// 安全检测：行必须以 | 开头 AND 以 | 结尾 AND 包含至少一个分隔符对
const isStandard = line.trim().startsWith('|') && line.trim().endsWith('|') && line.trim().includes('|', 1);
```

## `||` 后跟随标题的 Bug（v0.9.37+）

### 问题

LLM 输出中，`## 标题` 可能被 `||` 连接在表格行末尾，例如：

```
|OpenClaw（推荐）| 3分钟完成... || **HermesAgent** | MCP接入... || ## 二、AI Agent计费/变现基础设施
```

`split('||')` 后最后一个片段是 `## 二、...`，被当作表格行渲染成 `<td>`。

### 修复

`split('||')` 后过滤掉以 `#` 开头的片段：

```js
const rawRows = line.split('||')
  .map(s => s.trim())
  .filter(Boolean)
  .filter(s => !s.startsWith('#'));  // 跳过标题片段
```

### ⚠️ Tab 分隔内容被渲染为表格单元格

**症状**：DOM 中出现了 `<td>` 元素，但 `innerText` 显示内容是 tab 分隔的，不含 `|`。

**可能原因**：某处将 tab 分隔的文本拆分成了表格单元格。尚未确认具体代码位置。

**临时排查方法**：
1. 在 `renderMarkdown` 入口添加 `console.log('renderMarkdown input:', text.substring(0, 200))`
2. 检查输入文本中是否包含 tab 字符（`\t`）
3. 如果输入含 tab，确认是否有代码将 tab 分隔行当作表格处理

**注意**：`innerText` 中 tab 显示为空格，但 `innerHTML` 中可能保留 `\t`。用 `text.includes('\t')` 检测。

## 按钮 hover 显示

```css
.msg-actions-below {
  opacity: 0;
  pointer-events: none;
}
.msg-row-horizontal:hover .msg-actions-below {
  opacity: 1;
  pointer-events: auto;
}
```

**验证方法**：
```js
// 检查按钮存在
document.querySelector('.msg-row.agent .msg-actions-below .msg-action-btn')

// 检查 CSS hover 规则
Array.from(document.styleSheets[0].cssRules).find(r => r.selectorText?.includes(':hover'))
```

注意：`:hover` 伪类不能用 JS `classList.add('hover')` 模拟，必须用真实 mouseenter 事件或强制修改 style。

## 行内多元素分割（v0.9.38+）

当 LLM 输出多个 MD 元素挤在同一行时（`##H1###H2`、`##H| col |`、`1.xxx2.yyy`、`-xxx-yyy`），需要在 renderMarkdown 的 while 循环前做行内预处理分割。

**详见** `references/markdown-inline-splitting.md`

## `**加粗** + |表格|` 被误判为无序列表（v0.9.51+）

### 问题

LLM 回复中常见格式：

```markdown
**基础样式（.chat-model-select）：**
| 属性 | 值 |
|------|-----|
| position | relative |
```

`renderMarkdown` 将 `**...**` 行后的表格解析为 `<ul><li>` 无序列表，导致表格消失。

### 根因

三个独立问题叠加：

1. **`ulRe` 正则误匹配 mid-word hyphen**：`/(?<=\S)(?=-[^\s-])/g` 匹配 `chat-model` 中的 `-`，导致该行被识别为列表项起始
2. **heading+table 分割仅检测 `#` 不检测 `**`**：`endsWith('**')` 无法处理 `**:hover** 状态...：| 表格 |`（`**` 在行中间）
3. **主循环列表检测未排除 `**` 行**：`**...**` 行被误判为列表项

### 修复（3 处）

**修复 1：ulRe 正则加行首/空格约束**
```js
// ❌ 旧：mid-word hyphen 被误匹配
const ulRe = /(?<=\S)(?=-[^\s-])/g;

// ✅ 新：只匹配行首或空格后的列表标记
const ulRe = /(?<=^|\s)(?=-[^\s-])/g;
```

**修复 2：heading+table 分割扩展检测 `**`**
```js
// ❌ 旧：只检测 # heading 结尾
if (lines[i].trim().endsWith('#')) { ... }

// ✅ 新：检测 ** 或 # 在 | 前任意位置
if (lines[i].includes('**') || lines[i].includes('#')) { ... }
```

**修复 3：主循环列表检测排除 `**` 行**
```js
// ❌ 旧：未排除加粗行
if (line.trim().startsWith('-') || line.trim().startsWith('*')) { ... }

// ✅ 新：排除以 ** 开头的加粗行
if ((line.trim().startsWith('-') || line.trim().startsWith('*')) && !line.trim().startsWith('**')) { ... }
```

### 验证

```js
const testText = `**基础样式（.chat-model-select）：**
| 属性 | 值 |
|------|-----|
| position | relative |
| display | inline-block |`;

const result = renderMarkdown(testText);
const html = document.createElement('div');
html.appendChild(result);
// 检查：应包含 <table>，不应包含 <ul>
console.log('has table:', html.innerHTML.includes('<table'));
console.log('has ul:', html.innerHTML.includes('<ul>'));  // 应为 false
```

### 文件变更

- `webui/static/pages/core.js`：
  - `ulRe` 正则（约 L2603）
  - heading+table 分割条件（约 L2613-2618）
  - 主循环列表检测（约 L2907）
