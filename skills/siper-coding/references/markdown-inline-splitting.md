# renderMarkdown 行内多元素分割（v0.9.38+）

## 问题

LLM 输出的 Markdown 经常不规范，多个 MD 元素挤在同一行：

```
##🚀 Title### Heading2          ← 多个 heading 无换行
##Heading| col1 | col2 |        ← heading 后紧跟表格
1.item12.item2                  ← 有序列表项无换行
-item1-item2                    ← 无序列表项无换行
```code```                      ← 单行围栏代码块
```

## 解决方案：行内预处理分割

在 `renderMarkdown` 的 `while` 循环**之前**，对 `lines` 数组做全局预处理。

### 核心代码（最终版）

```js
{
  const expanded = [];
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    // ⚠️ 不能用长度阈值！短行如 "##A ###B" (8 chars) 也需要分割
    // 改为基于内容的过滤：只处理包含 MD 标记的行
    // ⚠️ 还必须检查行中间的 "- " 模式（v0.9.86 修复）
    const hasInlineList = /(?<=\S)- /.test(l);
    if (l.length < 5 || (!l.includes('#') && !l.includes('|') && !/\d+\./.test(l) && !/^[-*+]/.test(l) && !hasInlineList)) {
      expanded.push(l);
      continue;
    }
    const splits = [];

    // 1. Heading 边界（跳过表格行）
    if (!l.trim().startsWith('|')) {
      let hMatch;
      const hRe = /(?:^|[^#])(#{1,6})\s*[^#]/g;
      while ((hMatch = hRe.exec(l)) !== null) {
        const pos = hMatch.index + (hMatch[0].startsWith('#') ? 0 : 1);
        if (pos >= 0) splits.push(pos);
        if (hRe.lastIndex === hMatch.index) hRe.lastIndex++;
      }
    }

    // 2. 有序列表边界（跳过表格行）
    // 需要两个正则：一个有空格 "1. text"，一个无空格 "1.text"
    if (!l.trim().startsWith('|')) {
      let olMatch;
      const olRe = /(?<=\S)(?=\d+\.\s*\S)/g;
      while ((olMatch = olRe.exec(l)) !== null) {
        if (olMatch.index > 0) splits.push(olMatch.index);
        if (olRe.lastIndex === olMatch.index) olRe.lastIndex++;
      }
      const olRe2 = /(?<=\D)(?=\d+\.\S)/g;
      let olMatch2;
      while ((olMatch2 = olRe2.exec(l)) !== null) {
        if (olMatch2.index > 0) splits.push(olMatch2.index);
        if (olRe2.lastIndex === olMatch2.index) olRe2.lastIndex++;
      }
    }

    // 3. 无序列表边界（只跳过表格行，不跳过列表行本身）
    if (!l.trim().startsWith('|')) {
      let ulMatch;
      const ulRe = /(?<=\S)(?=-[^\s-])/g;
      while ((ulMatch = ulRe.exec(l)) !== null) {
        if (ulMatch.index > 0) splits.push(ulMatch.index);
        if (ulRe.lastIndex === ulMatch.index) ulRe.lastIndex++;
        if (splits.length > 20) break;
      }
    }

    // 4. Heading + 表格混合（跳过表格行）
    if (!l.trim().startsWith('|') && l.includes('#') && l.includes('|')) {
      const firstPipe = l.indexOf('|');
      const lastHash = l.lastIndexOf('#');
      if (firstPipe > lastHash && firstPipe > 0) splits.push(firstPipe);
    }

    if (splits.length === 0) { expanded.push(l); continue; }
    splits.sort((a, b) => a - b);
    const unique = [splits[0]];
    for (let s = 1; s < splits.length; s++) {
      if (splits[s] - unique[unique.length - 1] > 1) unique.push(splits[s]);
    }
    const parts = [];
    const beforeFirst = l.substring(0, unique[0]).trim();
    if (beforeFirst) parts.push(beforeFirst);
    for (let s = 0; s < unique.length; s++) {
      const start = unique[s];
      const end = s + 1 < unique.length ? unique[s + 1] : l.length;
      const part = l.substring(start, end).trim();
      if (part) parts.push(part);
    }
    if (parts.length > 1) expanded.push(...parts);
    else expanded.push(l);
  }
  lines.length = 0;
  lines.push(...expanded);
}
```

### 关键陷阱与修复

#### 1. 零宽正则无限循环
`/(?<=\S)(?=-[^\s-])/g` 在 `|------|------|` 中无限循环（每个 `-` 位置返回相同 index）。
修复：所有零宽正则 while 循环必须加 `lastIndex` 前进保护：
```js
if (ulRe.lastIndex === ulMatch.index) ulRe.lastIndex++;
```

#### 2. 表格行必须跳过所有边界检测
`ulRe`/`olRe`/`hRe` 都不应在以 `|` 开头的行上运行。

#### 3. 预处理必须在 while 循环外执行
在循环内 `splice` 会导致当前迭代用旧 `line` 变量。

#### 4. 不能用长度阈值过滤（v0.9.39 修复）
`l.length < 15` 会跳过短的多元素行（如 `##A ###B` 只有 8 字符）。
修复：改为基于内容的过滤——只处理包含 `#`、`|`、`数字.` 或 `-*+` 的行。

#### 5. ulRe 条件不能排除列表行（v0.9.39 修复）
旧代码 `!l.trim().startsWith('-') && !l.trim().startsWith('*')` 导致 `-item1-item2` 被跳过。
修复：只排除表格行 `!l.trim().startsWith('|')`。

#### 6. olRe 需要两个正则（v0.9.39 修复）
`/(?<=\S)(?=\d+\.\s*\S)/g` 不匹配 `2.text`（点后无空格）。
修复：增加 `olRe2 = /(?<=\D)(?=\d+\.\S)/g` 处理无空格格式。

#### 7. browser tool 缓存独立性
即使 mtime 更新，browser tool 可能仍用缓存。验证方法：
- 检查 `document.querySelector('script[src*="core.js"]').src` 版本号
- 用 `renderMarkdown('##A ###B')` 测试是否返回 2 个 heading
- 不能用 `JSON.stringify` 序列化含 emoji 的字符串（surrogate pair 错误）

#### 8. 验证方法
```js
const text = '##A ###B\n\n| C | D |\n|---|---|\n| 1 | 2 |\n\n1.xxx2.yyy\n\n-aaa-bbb';
const result = renderMarkdown(text);
const html = document.createElement('div');
html.appendChild(result);
// 检查：headings=2, tables=1, ols=1, uls=1
```

#### 9. 行中间 "- " 列表标记被预处理过滤跳过（v0.9.86+）

**问题**：LLM 输出中 `- ` 出现在行中间（如 `高潮：- 沈夜白...`、`金手指：- 现代刑侦知识...`），预处理过滤条件 `!/^[-*+]/.test(l)` 只检查行首，导致这些行被 `expanded.push(l)` 跳过，永远不会进入 ul 分割逻辑。

**修复**：在过滤条件中增加 `hasInlineList` 检查：
```js
// ❌ 旧：只检查行首
if (l.length < 5 || (!l.includes('#') && !l.includes('|') && !/\d+\./.test(l) && !/^[-*+]/.test(l))) {
  expanded.push(l);
  continue;
}

// ✅ 新：同时检查行中间的 "- " 模式
const hasInlineList = /(?<=\S)- /.test(l);
if (l.length < 5 || (!l.includes('#') && !l.includes('|') && !/\d+\./.test(l) && !/^[-*+]/.test(l) && !hasInlineList)) {
  expanded.push(l);
  continue;
}
```

**效果**：`高潮：- 沈夜白...` → 分割为 `高潮：`（段落）+ `- 沈夜白...`（列表项）

#### 10. ulRe prevChar 过滤器过度阻止 CJK 标点（v0.9.86+）

**问题**：`ulRe` 正则 `/(?<=\S)(?=- )/g` 匹配 `- ` 位置后，prevChar 过滤器 `/[—–\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/` 阻止了所有 CJK 标点（包括 `：`、`。`、`；`）后的分割。这导致 `高潮：- 沈夜白...` 中的 `- ` 无法被分割。

**修复**：改为只阻止字母、数字、CJK 文字、em-dash、连字符：
```js
// ❌ 旧：阻止 CJK 标点（如 ：、。）
if (prevChar && /[—–\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(prevChar)) { continue; }

// ✅ 新：只阻止字母/数字/CJK 文字/em-dash/连字符
if (prevChar && /[a-zA-Z0-9\u4e00-\u9fff\u3400-\u4dbf—–-]/.test(prevChar)) { continue; }
```

**效果**：`：`（U+FF1A）不在阻止范围内，`高潮：- ` 可以正常分割。

#### 11. Tab 转换后 line 变量未更新（v0.9.86+）

**问题**：tab-to-pipe 转换（core.js 第 3047-3070 行）修改了 `lines[j]`，但主循环中的 `line` 变量（在循环开始处 `let line = lines[i]` 赋值）仍持有旧的 tab 格式。由于 tab 转换在 fenced code block 检查之后、表格检测之前，`line` 变量始终是旧值，导致转换后的 pipe 格式被当作普通段落处理。

**修复**：tab 转换后更新 `line` 变量：
```js
// tab 转换循环后添加
line = lines[i];
```

**效果**：`天机阁\t神秘组织，贩卖情报，亦正亦邪` → 转换为 `| 天机阁 | 神秘组织，贩卖情报，亦正亦邪 |` → `line` 变量更新 → 表格检测正确识别为 `md-table`。

#### 12. ulRe2 lookbehind 扩展支持中文标点（v20260804d+）

**问题**：`ulRe2` 正则 `/(?<=\w)- /g` 的 lookbehind 只匹配单词字符（`\w` = `[a-zA-Z0-9_]`），导致中文标点（如 `：`、`）`、`。`）后的 `- ` 列表项无法被分割。

**典型场景**：LLM 输出 `-模型配置详情：-API地址：-超时时间：-模式：`，每个 `-` 前面是中文标点，`\w` 不匹配，整个行被当作一个列表项。

**修复**：扩展 lookbehind 字符类，加入常见中文标点和 ASCII 标点：

```js
// ❌ 旧：只匹配单词字符
const ulRe2 = /(?<=\w)- /g;

// ✅ 新：匹配单词字符 + 中文标点 + ASCII 标点
const ulRe2 = /(?<=[\w\uff1a\uff09\u3002\uff01\uff1b\uff1f:])- /g;
```

**新增字符**：
- `\uff1a` → `：`（全角冒号）
- `\uff09` → `）`（全角右括号）
- `\u3002` → `。`（中文句号）
- `\uff01` → `！`（全角感叹号）
- `\uff1b` → `；`（全角分号）
- `\uff1f` → `？`（全角问号）
- `:` → `:`（ASCII 冒号，兼容半角格式）

**效果**：
- `-模型配置详情：-API地址：` → 分割为 `-模型配置详情：` + `-API地址：`
- `步骤一）-第一步：-第二步：` → 正确分割

**注意**：此修改在 `renderMarkdown` 的预处理阶段（`while` 循环之前）执行，影响所有无序列表的分割行为。

## 标题/列表正则支持无空格

```js
const hMatch = line.match(/^(#{1,6})\s*(.*)/);
if (/^\d+\.\s*/.test(line.trim())) { ... }
if (/^[-*+]\s*/.test(line.trim())) { ... }
```

## 单行围栏代码块

```js
const singleFence = line.match(/^```(\w*)\s+([\s\S]+?)\s*```$/);
if (singleFence) {
  const code = document.createElement('code');
  code.className = 'md-code-inline';
  code.textContent = singleFence[2];
  frag.appendChild(code); i++; continue;
}
```

## 文件变更

- `core.js`：renderMarkdown 开头添加行内多元素分割预处理
- `core.js`：heading/列表正则支持无空格
- `core.js`：单行围栏代码块检测
