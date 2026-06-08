# ulRe2 无序列表分割修复 (v20260805)

## 问题

`core.js` 预处理阶段 `ulRe2` 正则（行内无序列表分割）存在两个误分割：

1. **小数被分割**: `LongCat-2.0-Preview` 中的 `2.0-` 被识别为列表项
2. **URL/单词内连字符被分割**: `openai-模式` 中的 `-模式` 被识别为列表项

同时存在一个**欠分割**：`120s-最大重试` 中的 `-最大` 未被分割（如果 lookbehind 排除了所有小写字母）。

## 修复方案

### 1. Lookbehind 改回包含小写字母

```js
// 之前（排除所有小写，导致 s-最大 不分割）
/(?<=[A-Z0-9_\uff1a...])(?=-[A-Z\u4e00-\u9fff...])/g

// 之后（包含小写，通过后缀检查排除单词内部连字符）
/(?<=[\w\uff1a\uff09\u3002\uff01\uff1b\uff1f:\u4e00-\u9fff\u3400-\u4dbf])(?=-[A-Z\u4e00-\u9fff\u3000-\u303f\uff00-\uffef*])/g
```

### 2. 小数排除（后缀检查）

```js
// Skip decimal patterns like "2.0-Preview"
if (pos >= 2 && l[pos - 2] === '.' && /\d/.test(l[pos - 1])) {
  ulRe2.lastIndex++;
  continue;
}
```

### 3. 单词内部连字符排除（后缀检查）

```js
// Skip word-internal hyphens: "openai-模式" (lowercase preceded by lowercase)
if (pos >= 1 && /[a-z]/.test(l[pos - 1]) && pos >= 2 && /[a-z]/.test(l[pos - 2])) {
  ulRe2.lastIndex++;
  continue;
}
```

`120s-最大` 中 `s` 前面是 `0`（数字），不满足"两个连续小写字母"条件，所以正确分割。

## 位置

`webui/static/pages/core.js` 约 3155-3175 行，`ulRe2` 匹配循环体内。
