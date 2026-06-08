# JS 正则懒惰匹配 + Lookahead 回溯陷阱

## 问题描述

在 core.js 的 `renderMarkdown` 预处理阶段，`headingJamMatch` 正则使用了懒惰量词 `*?`：

```javascript
// 旧正则（有 bug）
var headingJamMatch = l.trim().match(/^(#{1,6}[^\n#]*?)(#{1,6}\s*\S.*)$/);
```

当输入为 `## Title` 时，回溯引擎会把第一个 `#` 单独切出来，导致 `"#"` + `"# Title"` 的错误分割。第一个捕获组 `"#"` 不满足 heading 条件，整个 heading 被降级为 paragraph。

## 修复方案

```javascript
// 新正则（正确）
var headingJamMatch = l.trim().match(/^(#{1,6}\s*[^#\n].*?)(#{1,6}\s*\S.*)$/);
```

关键改动：`[^\n#]*?` → `\s*[^#\n].*?`

- `[^#\n]` **强制要求至少一个非 `#` 字符**
- 这样 `## Title` 中，第一部分必须包含 `T`，无法退化为 `"#"`
- `## Title` 整体不匹配 headingJamMatch，正确进入 heading 渲染正则

## 通用教训

**懒惰量词 `*?` + 字符类排除 + lookahead = 不可预测的分割**

当设计"把字符串分成两部分"的正则时：
1. **不要用懒惰量词作为唯一的分割机制** — 回溯会尝试所有分割点
2. **强制第一部分包含最小内容** — 用 `[^#\n]` 等强制字符确保第一部分不会退化
3. **始终测试边界情况** — 最短输入、无空格输入、粘连输入

## 版本历史

- v0.9.85b (2026-05-26): 发现并修复 `headingJamMatch` 正则懒惰匹配 bug
