# `**加粗** + |表格|` 被误判为无序列表（v0.9.51+）

## 问题现象

LLM 回复中常见格式：

```markdown
**基础样式（.chat-model-select）：**
| 属性 | 值 |
|------|-----|
| position | relative |
```

`renderMarkdown` 将 `**...**` 行后的表格解析为 `<ul><li>` 无序列表，表格消失。

## 根因（三处独立问题叠加）

### 1. `ulRe` 正则误匹配 mid-word hyphen

```js
// ❌ 旧：chat-model 中的 - 被匹配
const ulRe = /(?<=\S)(?=-[^\s-])/g;
```

`chat-model-select` 中的 `-model` 满足 `(?<=\S)(?=-[^\s-])`，被识别为列表项起始。

```js
// ✅ 修复：加行首/空格约束
const ulRe = /(?<=^|\s)(?=-[^\s-])/g;
```

### 2. heading+table 分割仅检测 `#` 不检测 `**`

```js
// ❌ 旧：** 在行中间时漏检
if (lines[i].trim().endsWith('**')) { splitHeadingTable(i); }
```

LLM 输出 `**:hover** 状态...：| 表格 |` 时，`**` 不在行尾。

```js
// ✅ 修复：检测 ** 或 # 在 | 前任意位置
if (lines[i].includes('**') || lines[i].includes('#')) { splitHeadingTable(i); }
```

### 3. 主循环列表检测未排除 `**` 行

```js
// ❌ 旧：**...** 行被误判为列表项
if (line.trim().startsWith('*')) { startList(); }
```

`**text**` 以 `*` 开头但这是加粗标记，不是无序列表。

```js
// ✅ 修复：排除 ** 开头的加粗行
if (line.trim().startsWith('*') && !line.trim().startsWith('**')) { startList(); }
```

## 修复位置（core.js）

| 修复 | 位置 | 改动 |
|------|------|------|
| ulRe 正则 | ~L2603 | `(?<=\S)` → `(?<=^|\s)` |
| heading+table 分割 | ~L2613-2618 | `endsWith('**')` → `includes('**') \|\| includes('#')` |
| 列表检测排除 | ~L2907 | 加 `!line.trim().startsWith("**")` |

## 验证方法

```js
// 浏览器控制台
const test = `**基础样式（.chat-model-select）：**
| 属性 | 值 |
|------|-----|
| position | relative |`;
const result = renderMarkdown(test);
const div = document.createElement('div');
div.appendChild(result);
console.log('has table:', div.innerHTML.includes('<table'));  // true
console.log('has ul:', div.innerHTML.includes('<ul>'));       // false ← 关键
```

## 诊断流程

1. 检查 DOM：`document.querySelector('.msg-body agent table')` 是否存在
2. 检查是否被 `<ul>` 包裹：`document.querySelector('.msg-body agent ul')`
3. 如果是 → 上述三处修复
