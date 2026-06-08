# Markdown `|` 在代码块中的保护（v0.9.71+）

## 问题

LLM 输出中，行内代码和围栏代码块内可能包含 `|` 字符：

```markdown
使用 `grep -E "foo|bar"` 命令过滤
```

````markdown
```javascript
if (a|b) { return true; }
```
````

renderMarkdown 的表格检测会将这些 `|` 误判为表格列分隔符，导致：
- 行内代码中的 `|` 被当作表格行分割点
- 围栏代码块中的 `|` 被提取为表格单元格内容

## 根因

1. **行内代码保护时机问题**：预处理阶段用 `\x00P{N}\x00` 占位符替换行内代码，但还原发生在行分割之后。还原后的 `|` 重新出现在文本中，被后续的表格检测逻辑捕获。

2. **围栏代码块保护缺失**：预处理阶段只保护行内代码，不保护围栏代码块（`` ```...``` ``）中的 `|`。当围栏代码块与文本同行时（如 `` text ```lang//code``` text ``），其中的 `|` 直接暴露给表格检测。

3. **单行围栏代码正则过严**：`/^```(\w*)\s+(.+?)```$/` 要求语言标签后有空格（`\s+`），但 LLM 输出格式可能是 `` ```javascript//code ``（无空间），导致围栏代码块未被识别。

## 解决方案

### 1. 围栏代码块 `|` 保护（预处理阶段）

在进行行内代码保护之前，先将围栏代码块中的 `|` 替换为占位符：

```js
// 在预处理循环中，行内代码保护之前
l = l.replace(/```[\s\S]*?```/g, (m) => {
  return m.replace(/\|/g, '\x00B');
});
```

`\x00B` = protected pipe character，在后续流程中不会被表格检测识别为 `|`。

### 2. 行内代码还原时保护 `|`

行内代码占位符 `\x00P{N}\x00` 还原时，将内容中的 `|` 替换为 `\x00B`：

```js
// 还原行内代码时
l.replace(/\x00P(\d+)\x00/g, (_, i) => {
  let code = codeSpans[parseInt(i)] || '';
  code = code.replace(/\|/g, '\x00B');  // 保护代码中的 pipe
  return '`' + code + '`';
});
```

这样还原后的行内代码 `` `grep -E "foo|bar"` `` 实际为 `` `grep -E "foo\x00Bbar"` ``，表格检测看不到 `|`。

### 3. `inline()` 函数中还原 `\x00B`

`inline()` 函数处理文本时，在 escape HTML 之后、返回之前还原占位符：

```js
function inline(text) {
  let s = escapeHtml(text);
  // ... 处理 bold/italic/link/image ...
  s = s.replace(/\x00B/g, '|');  // 还原 protected pipe
  return s;
}
```

**时机**：必须在 `escapeHtml` 之后，否则 `|` 被 escape 后再替换无效。

### 4. `syntaxHighlight()` 函数中还原 `\x00B`

语法高亮函数同样需要还原：

```js
function syntaxHighlight(code) {
  let s = escapeHtml(code);
  // ... 语法高亮处理 ...
  s = s.replace(/\x00B/g, '|');  // 还原 protected pipe
  return s;
}
```

### 5. 单行围栏代码正则放松

```js
// ❌ 旧：要求语言标签后有至少一个空格
const fenceMatchInline = line.match(/^```(\w*)\s+(.+?)```$/);

// ✅ 新：允许语言标签后无空格（匹配 ```lang//code 格式）
const fenceMatchInline = line.match(/^```(\w*)\s*(.+?)```$/);
```

## 占位符体系

| 占位符 | 用途 | 还原位置 |
|--------|------|----------|
| `\x00P{N}\x00` | 行内代码 span | 预处理分割后 |
| `\x00C` | `inline()` 内部 code | `inline()` 返回前 |
| `\x00B` | 受保护的 pipe 字符 | `inline()` 和 `syntaxHighlight()` |
| `\x00F` | ~~围栏代码 span~~（已弃用，改用 `\x00B`） | — |

## 验证方法

```js
// 测试 1：行内代码含 pipe
const t1 = 'Use `grep -E "foo|bar"` to filter';
const r1 = renderMarkdown(t1);
// 期望：<p>Use <code>grep -E "foo|bar"</code> to filter</p>
// 不应包含 <table>

// 测试 2：围栏代码块含 pipe
const t2 = '```js\nif (a|b) return true;\n```';
const r2 = renderMarkdown(t2);
// 期望：<pre><code>if (a|b) return true;</code></pre>
// 不应包含 <table>

// 测试 3：行内代码含 ||
const t3 = 'Use `a||b` for OR';
const r3 = renderMarkdown(t3);
// 不应被 || 行分隔符逻辑误判

// 测试 4：单行围栏代码无空格
const t4 = '```javascript//const x = 1|2;```';
const r4 = renderMarkdown(t4);
// 应识别为围栏代码块，不渲染为表格

// 综合测试
const t5 = `Use \`grep -E "foo|bar"\` for filtering.
| 列1 | 列2 |
|------|------|
| A | B |
\`\`\`js
if (a|b) { return true; }
\`\`\``;
const r5 = renderMarkdown(t5);
// 期望：<p> + <table> + <pre><code>，三者都正确渲染
```

## 回归测试清单

修改此逻辑后必须验证：
1. ✅ 标准表格（`| h1 | h2 |`）正常渲染
2. ✅ text+表格混合行正常渲染
3. ✅ `||` 行分隔符正常渲染
4. ✅ 行内代码含 `|` 不触发表格
5. ✅ 围栏代码块含 `|` 不触发表格
6. ✅ 行内代码含 `||` 不触发 `||` 行分隔
7. ✅ 标准围栏代码块（独立行）正常渲染
8. ✅ 单行围栏代码（`` ```lang//code ``）正常渲染

## 常见陷阱

- **`\x00B` 还原必须在 `escapeHtml` 之后**：如果先还原 `|` 再 escape，`|` 会被当作普通文本 escape（无害但无效），但关键是 `\x00B` 本身不会被 escape，所以顺序其实不影响安全性。但为了代码清晰，建议在 escape 之后还原。
- **不要与 `\x00C` 冲突**：`\x00C` 是 `inline()` 内部使用的占位符，`\x00B` 是不同的用途。
- **围栏代码块保护必须在行内代码保护之前**：否则行内代码保护正则可能匹配围栏代码块内部的 backtick。
