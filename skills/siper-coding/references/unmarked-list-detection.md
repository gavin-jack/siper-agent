# renderMarkdown 无标记列表智能检测

## 问题描述

LLM 输出文件列表时，经常不写 `- ` 或 `* ` 列表标记，而是直接把多个 `文件名(size)` 挤在同一行：

```
241200招标文件正文.pdf(709KB)物联网平台.docx (17KB)物联网平台工程量.xlsx (14KB)
```

标准 Markdown 渲染器无法识别这种格式，会渲染成一大段文字。

## 解决方案

在 `renderMarkdown` 预处理阶段增加"无标记列表检测"：

1. 扫描行内所有 `(数字+单位)` 模式（如 `(709KB)`、`(17KB)`、`(282B)`）
2. 用 `indexOf` 字符串扫描定位（避免正则回溯）
3. 如果找到 2+ 个 size 标记且覆盖行内 30%+ 内容，判定为无标记列表
4. 在 size 标记边界处分割，每段前加 `- ` 转为标准列表项

## 关键代码模式

```js
// 查找所有 "(size)" 位置
const sizePositions = [];
let searchIdx = 0;
while (searchIdx < l.length) {
  const parenIdx = l.indexOf('(', searchIdx);
  if (parenIdx < 0) break;
  const after = l.substring(parenIdx + 1, parenIdx + 15);
  if (/^\s*[\d.]+\s*[KMGT]?B\s*\)/.test(after)) {
    const closeIdx = l.indexOf(')', parenIdx);
    if (closeIdx > parenIdx) {
      sizePositions.push({ start: parenIdx, end: closeIdx + 1 });
      searchIdx = closeIdx + 1;
      continue;
    }
  }
  searchIdx = parenIdx + 1;
}

// 分割为列表项
if (sizePositions.length >= 2) {
  const parts = [];
  let lastEnd = 0;
  for (let si = 0; si < sizePositions.length; si++) {
    let itemEnd = sizePositions[si].end;
    if (si + 1 < sizePositions.length) {
      const between = l.substring(itemEnd, sizePositions[si + 1].start);
      const dashIdx = between.indexOf('—');
      if (dashIdx >= 0) {
        itemEnd = itemEnd + dashIdx + 1; // 包含 em dash 前的描述
      }
      // 不包含 trailing text（那是下一个文件名）
    } else {
      itemEnd = l.length;
    }
    const item = l.substring(lastEnd, itemEnd).trim();
    if (item) parts.push('- ' + item);
    lastEnd = itemEnd;
  }
}
```

## 注意事项

1. **不要用正则匹配 `文件名(size)`**：嵌套量词会导致灾难性回溯
2. **size 标记前的 `(` 不一定是 size 的开始**：如 `pdf(709KB)` 中 `pdf(` 的 `(` 不是 size 开始，但 `after` 检查会正确识别
3. **分割时不包含 trailing text**：`)物联网平台.docx` 中的 `物联网平台.docx` 是下一个文件名，不是描述
4. **em dash `—` 作为描述分隔符**：`文件名(size)— 描述` 中的 `—` 应该被包含在当前项中

## 分隔符检测：`—` vs `- `（v0.9.68+ 最终版）

### 核心区分

| 字符 | 含义 | 处理方式 |
|------|------|----------|
| `—` (em dash, U+2014) | 描述分隔符 | **不分割**，保留在当前列表项中 |
| `- ` (hyphen + space) | 列表项分隔符 | **分割** |
| `-$` | 文件名模式分隔符（Office 临时文件） | **分割** |
| `-.` | 文件名模式分隔符 | **分割** |

**⚠️ 关键规则：只检测 `- `、`-$`、`-.` 作为列表项分隔符。禁止检测 `—`（em dash）。**

### 典型输入

```
Working.lnk (1.6KB)— 快捷方式- ~$SunMaster PV BESS presentation.pptx (165B)— Office临时文件- ~$西部经济开发区...docx (162B)— Office临时文件
```

### 期望输出

- `Working.lnk (1.6KB) — 快捷方式`
- `~$SunMaster PV BESS presentation.pptx (165B) — Office临时文件`
- `~$西部经济开发区...docx (162B) — Office临时文件`

### 最终正确实现

```js
for (let si = 0; si < unique.length; si++) {
  let itemEnd = unique[si].end;
  if (si + 1 < unique.length) {
    const between = l.substring(itemEnd, unique[si + 1].start);
    // 只检测 hyphen 类分隔符，不检测 em dash
    const hyphenSpaceIdx = between.indexOf('- ');
    const hyphenDollarIdx = between.indexOf('-$');
    const hyphenDotIdx = between.indexOf('-.');
    const hyphenGeneral = between.search(/(?<=\S)- (?=[~$A-Z\u4e00-\u9fff])/);
    let sepIdx = Math.min(
      hyphenSpaceIdx >= 0 ? hyphenSpaceIdx : Infinity,
      hyphenDollarIdx >= 0 ? hyphenDollarIdx : Infinity,
      hyphenDotIdx >= 0 ? hyphenDotIdx : Infinity,
      hyphenGeneral >= 0 ? hyphenGeneral : Infinity
    );
    if (sepIdx === Infinity) sepIdx = -1;
    if (sepIdx >= 0) {
      itemEnd = itemEnd + sepIdx; // 不包含分隔符字符
    }
  } else {
    itemEnd = l.length;
  }
  const item = l.substring(lastEnd, itemEnd).trim();
  if (item) {
    // 避免重复 "- " 前缀
    parts.push(item.startsWith('- ') ? item : '- ' + item);
  }
  lastEnd = itemEnd;
}
```

### 中间过程的错误方案（勿用）

```js
// ❌ 错误：同时检测 — 和 - ，取 Math.min
// 这会导致 — 被当成分割点，描述文本被分到下一项
const dashIdx = between.indexOf('—');
const hyphenIdx = between.indexOf('- ');
let sepIdx = Math.min(dashIdx, hyphenIdx); // 错误！
```

## `*` 转 `- ` 的预处理

LLM 有时用 `*` 作为列表标记（如 `*111.png`），但这会被 `inline()` 识别为斜体。预处理阶段转换：

```js
l = l.replace(/(^|(?<=[^a-zA-Z0-9*]))\*([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$]+)/g, '$1- $2');
```

注意：`*` 前面不能是字母数字（避免转换强调标记 `word*word*word`）。

## 版本历史

- v0.9.68: 新增无标记列表检测，`*` → `- ` 转换，`indexOf` 扫描替代正则
