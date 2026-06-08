# marked.js 集成参考（v0.9.58+）

## 概述

SiPer 的 Markdown 渲染器已从手写 regex 链（~540 行）切换为 [marked.js](https://marked.js.org/) v16.3.0 UMD 版本，保留预处理逻辑处理 LLM 非标准输出。

## 文件变更

### 新增文件

- `webui/static/marked.umd.js`（40KB）— marked.js UMD 构建版本，通过 `<script>` 标签加载

### 修改文件

**`webui/templates/index.html`** — 在 core.js 之前引入 marked.js：
```html
<script src="/static/marked.umd.js"></script>
<script src="/static/pages/core.js?v=20260522a"></script>
```

**`webui/static/pages/core.js`** — 替换 `renderMarkdown` 函数：

```javascript
function renderMarkdown(text) {
  if (!text) return document.createTextNode('');
  text = preprocessMarkdown(text);           // 预处理 LLM 非标准输出
  const html = marked.parse(text);           // marked.js 渲染（支持 GFM）
  const frag = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  return frag;                               // 返回 DocumentFragment（兼容所有调用点）
}
```

**删除的代码**：
- `syntaxHighlight()` 函数（~60 行）— marked.js 原生处理代码块
- `esc()` 函数 — marked.js 内置 HTML 转义
- `inline()` 函数 — marked.js 内置 inline 解析
- 主循环中的所有手写解析逻辑（~400 行）

**保留的代码**：
- `preprocessMarkdown()` 函数（~75 行）— 处理 LLM 非标准输出

## 预处理逻辑（preprocessMarkdown）

保留预处理的原因：LLM 输出常包含非标准 Markdown 格式，marked.js 无法直接处理。

### 处理的格式

1. **Tab 分隔表格** → pipe 格式
   - 条件：连续 2+ 行含 2+ 个 tab，且不含 `|`
   - 转换：`col1\tcol2\tcol3` → `| col1 | col2 | col3 |`

2. **text|table| 混合行分割**
   - 条件：行不以 `|` 开头，包含 `|`，pipe 后 2+ 列
   - 分割：`text | col1 | col2 |` → `text` + `| col1 | col2 |`

3. **跨行 bold 合并**
   - Case 1: 行只有 `**` → 收集直到闭合 `**`
   - Case 2: 行以 `**` 开头但未闭合 → 收集直到闭合 `**`

### 不处理的格式（marked.js 原生支持）

- 标准 GFM 表格（`| col1 | col2 |`）
- 任务列表（`- [x] / - [ ]`）
- 删除线（`~~text~~`）
- 代码块（` ```lang ... ``` `）
- 标题（`# h1` ~ `###### h6`）
- 列表（`- item` / `1. item`）
- 引用（`> quote`）
- 链接（`[text](url)`）
- 图片（`![alt](url)`）

## 调用点兼容性

所有调用 `renderMarkdown()` 的地方无需修改，因为适配器保持了相同的签名：

| 调用点 | 文件 | 用法 |
|--------|------|------|
| 消息渲染 | `page-chat.js:250` | `body.appendChild(renderMarkdown(text))` |
| 流式渲染 | `core.js:1441` | `body.appendChild(renderMarkdown(_streamAcc))` |

两者都期望 `renderMarkdown` 返回 `DocumentFragment`，适配器通过 `tmp.innerHTML = html` + `while (tmp.firstChild) frag.appendChild(tmp.firstChild)` 实现。

## 大函数替换陷阱

**⚠️ 不要用 patch 直接替换 renderMarkdown 函数体**

原因：renderMarkdown 函数内部嵌套了 `syntaxHighlight`、`esc`、`inline` 等子函数。patch 的 old_string 如果跨越函数边界，会删除不该删的 closing brace，导致语法错误。

**安全做法**：
```bash
# 1. 保留函数前的代码
head -n 2521 core.js > part1.js
# 2. 保留函数后的代码
tail -n +2586 core.js > part2.js
# 3. 合并
cat part1.js part2.js > core.js
# 4. 语法检查
node -c core.js
```

## 验证方法

1. **确认 marked.js 加载**：`browser_console` → `typeof marked === 'object'`
2. **确认适配器工作**：`browser_console` → `typeof renderMarkdown === 'function'`
3. **测试渲染**：`browser_console` → `renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")` 返回 DocumentFragment
4. **测试预处理**：`browser_console` → `renderMarkdown("text | col1 | col2 |\n|---|---|")` 正确分割段落和表格

## 回滚方案

如果需要回滚到手写版本：
1. 删除 `index.html` 中的 `<script src="/static/marked.umd.js">`
2. 删除 `webui/static/marked.umd.js`
3. 恢复 `core.js` 中的手写 `renderMarkdown` + `syntaxHighlight` + `esc` + `inline` 函数

## 性能对比

| 指标 | 手写 regex | marked.js |
|------|-----------|-----------|
| JS 大小 | 0（内联） | 40KB（gzip ~12KB） |
| 解析速度 | 快（简单 regex） | 稍慢（完整解析器） |
| GFM 支持 | 部分 | 完整 |
| 维护成本 | 高 | 低 |
| 代码行数 | ~540 行 | ~15 行 + 库 |
