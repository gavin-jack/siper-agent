# Markdown 渲染修复 v2026-08-07

## 1. 行内列表分割 — CJK 字符后 `- **` 模式

**问题**：ulRe 过滤器 `/[a-zA-Z0-9\u4e00-\u9fff\u3400-\u4dbf—–-]/` 阻止了 CJK 字符后的 `- ` 分割，但 LLM 输出 `等- **查资料**` 中 CJK + `- **` 是列表项标记。

**修复**：在 ulRe 过滤器中，当 prevChar 是 CJK 且 `- ` 后面紧跟 `*` 时，允许分割：
```javascript
const afterHyphen = l.substring(ulMatch.index + 2, ulMatch.index + 5);
if (/^[\u4e00-\u9fff\u3400-\u4dbf]/.test(prevChar) && /^\*+/.test(afterHyphen)) {
  // CJK + "- *..." → likely list item, allow split
} else {
  ulRe.lastIndex++;
  continue;
}
```

**位置**：`core.js` ulRe 循环内

## 2. 无闭合代码块提取

**问题**：LLM 输出 `\`\`\`css.code...`（lang 直接跟代码，无闭合 ```）无法被 Phase 0 正则提取。

**修复**：新增 `unclosedRe` 正则：
```javascript
const unclosedRe = /```(\w+)([^\n]+)(?=\n|$)/g;
```

**位置**：`core.js` Phase 0 提取阶段，singleLineRe 之后

## 3. 无闭合代码块恢复

**问题**：提取的代码块占位符在多行/单行正则都不匹配时显示为 `CODEBLOCK0`。

**修复**：新增 fallback 处理：
```javascript
if (!cbMatch) {
  cbMatch = cb.match(/```(\w+)([^\n]+)/);
  if (cbMatch) { /* render as single-line code block */ }
}
```

**位置**：`core.js` 代码块恢复阶段，单行正则之后

## 4. 标题数字粘连 (`###1.` → `### 1.`)

**问题**：`###1. 标题` 中 `#` 后直接跟数字，heading 检测 `/^(#{1,6})\s*(.*)/` 不匹配。

**修复**：新增 `headingNumMatch` 预处理：
```javascript
var headingNumMatch = l.trim().match(/^(#{1,6})(\d[\d\-]*\..*)$/);
if (headingNumMatch) {
  expanded.push(headingNumMatch[1]);
  expanded.push(headingNumMatch[2]);
  continue;
}
```

**匹配模式**：`###1.`、`###4-6.`、`###10.` 等

**位置**：`core.js` 预处理阶段，headingJam 之前

## 5. 空标题处理 (`###` 单独一行)

**问题**：`###` 无内容时被渲染为 `<p>###</p>`。

**修复**：空标题渲染为 `<hr class="md-hr">`：
```javascript
if (hMatch) {
  const headingText = hMatch[2].trim();
  if (!headingText) {
    const hr = document.createElement('hr');
    hr.className = 'md-hr';
    frag.appendChild(hr);
    i++;
    continue;
  }
  // ... normal heading rendering
}
```

**位置**：`core.js` heading 检测逻辑

## 6. Heading 文本内粘连 — `##标题###子标题` 模式

**问题**：LLM 输出 `## 发现的问题###⚠️轻微问题` 中 `###` 紧接在 `##` 文本后。预处理阶段 `hrHeadingMatch`（`/^(.*?)---+\s*(#{1,6}\s*.*)$/`）先匹配 `---##...` 并 `continue`，导致 `headingJam` 不执行。主循环中 heading 检测 `/^(#{1,6})\s*(.*)/` 把整个 `发现的问题###⚠️轻微问题` 当作 heading 文本。

**修复**：在 heading 检测阶段（主循环）添加 `jammedHeading` 检查：
```javascript
const jammedHeading = headingText.match(/^(.*?)(#{1,6}\s*\S.*)$/);
if (jammedHeading && jammedHeading[1].trim() && !jammedHeading[1].endsWith('#')) {
  // Render first heading
  const h1 = document.createElement('h' + lvl);
  h1.className = 'md-heading md-h' + lvl;
  h1.innerHTML = inline(jammedHeading[1].trim());
  frag.appendChild(h1);
  // Insert the second heading as a new line to process next
  lines.splice(i + 1, 0, jammedHeading[2].trim());
  i++;
  continue;
}
```

**条件**：`jammedHeading[1].trim()` 非空且不以 `#` 结尾（防止 7+ `#` 被错误拆分）

**位置**：`core.js` heading 检测逻辑，空标题检查之后、table-in-heading 检查之前

**验证**：发送包含 `## 发现的问题###⚠️轻微问题` 的消息，检查渲染结果应为两个独立 heading（`<h2>发现的问题</h2><h3>⚠️轻微问题</h3>`）

## 7. `###✅` 非数字字符后跟 `#`（已知限制）

**问题**：`###✅ 正常项` 中 `###` 后跟 emoji 而非数字，`headingNumMatch`（要求 `\d+`）不匹配。

**当前行为**：被当作整体 `<h3>` 渲染，heading 文本含 emoji。

**影响**：较小，不影响可读性。暂不修复。

**如需修复**：可在 heading 检测阶段添加 emoji/CJK 开头的 heading 文本分割（类似 jammedHeading）。

## 调试技巧（补充）

- **Browser 测试 renderMarkdown**：`renderMarkdown` 是 IIFE 内部函数，不在 `window` 上。测试方法：在聊天框发送包含目标 MD 的消息，用 `browser_console` 查询 `.msg-body` 的 `innerHTML` 检查渲染结果
- **发送消息**：`browser_type(ref="chatInput", text="...")` + `browser_press(key="Enter")` 或 dispatch `keydown/keypress/keyup` 事件
- **browser_console 返回的 snapshot 可能只显示可见区域**：用 JS 直接查询特定消息索引更可靠（如 `document.querySelectorAll('.msg-row')[121]`）
