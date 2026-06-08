# MD 渲染器代码块解析修复 — LLM 非标准格式兼容

## 问题描述

LLM 输出的代码块格式不规范，原有 `renderMarkdown` 解析器只支持标准格式（````lang` 独占一行），导致以下三种非标准格式渲染失败：

| 非标准格式 | 示例 | 原有行为 |
|---|---|---|
| 语言+内容无换行 | ````bash# comment\ncode``` | 代码块不识别，内容被当普通文本 |
| 结束标记+标题粘连 | `code\n```#### 标题` | ``` 被吞掉，标题丢失 |
| 无语言标识+内容 | ````code text\nmore code``` | 不识别为代码块 |

## 原有代码的漏洞分析

原有代码块检测（core.js ~2897行）只有两种匹配：

```javascript
const fenceMatch = line.match(/^```(\w*)\s*$/);       // 标准：``` 独占一行
const fenceMatchInline = line.match(/^```(\w+)(\S.*)```\s*$/);  // 单行闭合
```

无法处理：
- ````bash# comment` — 语言标识后直接跟 `#`，无空格无换行
- ````#### 标题` — 结束标记后紧跟标题
- ````some code` — 无语言标识，直接跟内容

## 修复方案：Phase 0 预处理提取

在逐行分割（Phase 1）之前，先扫描整个文本，提取所有代码块为占位符：

```javascript
const codeBlocks = [];
let protectedText = combinedText.replace(
  /```(\w*)([^\n]*)\n([\s\S]*?)```/g,
  function(m) {
    const placeholder = '\x00CODEBLOCK' + codeBlocks.length + '\x00';
    codeBlocks.push(m);
    return placeholder;
  }
);
```

占位符 `\x00CODEBLOCKn\x00` 中的 `\x00` 控制字符不会被任何正则匹配，所以后续处理不会破坏它们。

在渲染循环中，遇到占位符直接输出预渲染 HTML：

```javascript
if (line.match(/^\x00CODEBLOCK(\d+)\x00$/)) {
  const idx = parseInt(RegExp.$1);
  const cb = codeBlocks[idx];
  // 解析并渲染代码块...
}
```

## 支持的四种代码块模式

1. **标准多行**：````lang\ncode\n``` — Phase 0 提取
2. **语言+内容同行**：````langcontent\ncode\n``` — Phase 0 提取
3. **无语言标识**：````content\ncode\n``` — Phase 0 提取
4. **单行闭合**：````langcode...``` — Phase 0 单独提取（singleLineRe）

## Phase 1 补充分割

Phase 0 提取后，Phase 1 还需要处理 ````#heading` 分割（结束标记+标题粘连）：

```javascript
const fenceHeadingMatch = l.match(/^(.*?)```\s*(#{1,6}\s*.*)$/);
if (fenceHeadingMatch) {
  expanded.push(fenceHeadingMatch[1], fenceHeadingMatch[2]);
  continue;
}
```

注意：Phase 0 已经提取了多行代码块，所以 Phase 1 中的 `fenceHeadingMatch` 不会遇到代码块内部的 ```。

## 额外修复：变量名 Bug

预处理循环中 `let l = lines[i]` 应改为 `let l = lines[li]`。`i` 是外层 while 循环的索引，在预处理循环中被错误使用。

## 占位符约定

| 占位符 | 用途 |
|--------|------|
| `\x00P` | 行内代码 span（inline code） |
| `\x00C` | inline() 内部 code |
| `\x00B` | 保护代码中的 pipe 字符 `|` |
| `\x00CODEBLOCKn` | 多行/单行代码块（Phase 0 提取） |

## 验证方法

用 Node.js VM 测试渲染效果（browser_console 与页面隔离，不可靠）：

```javascript
const vm = require('vm');
const ctx = vm.createContext();
vm.runInContext(coreJsCode, ctx);
const result = ctx.renderMarkdown(testMd);
```

## 相关 Commit

- `3f6db34` — fix: MD 渲染器代码块解析修复 — 支持 LLM 非标准格式
