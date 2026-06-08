# Markdown 预处理占位符冲突与列表分割正则陷阱

## 问题：Preprocessor Placeholder 与 inline() 占位符冲突

### 现象
行内代码 span（如 `` `hermes-memory-backup/` ``）在预处理阶段被保护后，经过 `inline()` 函数处理后，`<li>` 内容变为空。

### 根因
预处理阶段和 `inline()` 内部使用**相同的占位符格式** `\x00C{N}\x00`：
- 预处理：将 `` `code` `` 替换为 `\x00C0\x00`，分割后还原
- `inline()`：将 `` `code` `` 替换为 `\x00C0\x00` 处理后再还原

当预处理保护了 code span 后，`inline()` 内部的 replace 匹配不到 backtick（已被替换），但 inline() 的还原正则会把预处理的占位符当成自己的去还原，导致输出为空。

### 修复
预处理阶段改用不同的占位符前缀 `\x00P`（P = preprocess）：

```js
// 预处理保护
l = l.replace(/`([^`]+)`/g, (_, c) => { codeSpans.push(c); return '\x00P' + (codeSpans.length - 1) + '\x00'; });

// 预处理还原（分割完成后）
expanded.push(...parts.map(p => p.replace(/\x00P(\d+)\x00/g, (_, i) => '`' + (codeSpans[parseInt(i)] || '') + '`')));
```

**关键**：无分割时也必须还原（之前代码在无分割时直接 push 含占位符的原始字符串）：

```js
if (splits.length === 0) {
  expanded.push(l.replace(/\x00P(\d+)\x00/g, (_, i) => '`' + (codeSpans[parseInt(i)] || '') + '`'));
  continue;
}
```

## 问题：有序列表正则匹配文件名中的数字+点

### 现象
`111.png (5KB)` 被分割为有序列表项 `111.` + `png (5KB)`

### 根因
`olRe2 = /(?<=\D)(?=\d+\.\S)/g` 匹配了文件名中的数字+点模式（如 `111.p`）

### 修复
改为只匹配大写字母或 CJK 开头的列表项：

```js
const olRe2 = /(?:^|(?<=[\s)]))(?=\d+\.[A-Z\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g;
```

## 问题：无序列表正则匹配日期/版本号模式

### 现象
`ScreenShot_2026-05-15_130542_907.png` 在 `-05` 处被分割

### 根因
`ulRe = /(?<=\S)(?=-[^\s-])/g` 匹配了 `2026-05` 中的 `-05`（digit-digit 模式）

### 修复
增加 digit-digit 检测跳过日期/版本号：

```js
if (prevChar && /\d/.test(prevChar) && /\d/.test(l[ulMatch.index + 1] || '')) {
  ulRe.lastIndex++;
  continue;
}
```

## 问题：em-dash 后的连字符被误分割

### 现象
`— 招标文件- 物联网平台方案` 在 `- 物联网` 处被错误分割

### 修复
检查前一个字符是否为 em-dash 或 CJK 标点：

```js
if (prevChar && /[—–\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(prevChar)) {
  ulRe.lastIndex++;
  continue;
}
```

## 测试用例

```
输入：'- `hermes-memory-backup/`'
期望：<ul><li><code class="md-code-inline">hermes-memory-backup</code></li></ul>

输入：'- 111.png (5KB)\n- ScreenShot_2026-05-15_130542_907.png (382KB)'
期望：两个 <li> 完整显示文件名，不被分割

输入：'### 📄文件文档类：\n- item1\n- item2'
期望：<h3>📄文件文档类：</h3><ul><li>item1</li><li>item2</li></ul>
```

## 版本历史
- v0.9.67 (2026-05-27)：修复 placeholder 冲突、有序/无序列表正则误匹配
- v0.9.68 (2026-05-27)：filePattern 分割中增加 `- `/`-$`/`-.` 分隔符检测，区分 em dash（描述分隔）和 hyphen+space（列表分隔）
