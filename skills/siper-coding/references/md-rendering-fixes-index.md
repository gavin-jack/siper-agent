# MD 渲染修复综合索引

## 本文件是 MD 渲染修复的综合入口，按时间顺序记录所有修复。

## 修复时间线

### v0.9.86 — 7 大 MD 渲染陷阱系统性修复

详见 `references/md-rendering-pitfalls.md`（系统性陷阱汇总，含诊断方法论和测试用例）。

1. **ul 分支误匹配 `**加粗**`**：`/^[-*+]\s*/` 把 `**text**` 误判为列表项 → 添加 `!/^\*\*/.test(line.trim())`
2. **text-before-table 误判 heading**：`### Title|col1|` 被提前捕获 → 添加 `!/^#{1,6}\s*/.test(line.trim())`
3. **heading jam（标题粘连）**：`分卷大纲### 第一卷` 未分割 → 预处理 heading jam 分割正则
4. **`---###` 粘连**：未正确分割为 HR + heading → 预处理分割
5. **行中间 `- ` 误过滤**：`高潮：- 沈夜白...` 被跳过 → 添加 `hasInlineList` 检查
6. **ulRe prevChar 过度阻止 CJK 标点**：`：`、`。` 后的 `- ` 未分割 → 改为只阻止字母/数字/CJK 文字
7. **tab 转换后 line 未更新**：pipe 格式被跳过 → 添加 `line = lines[i]`

### renderMarkdown 主循环处理顺序（必读）

```
code block → text-before-table → table → heading → HR → blockquote → list → paragraph
```

**关键**：排在前面的检测会优先捕获行，即使该行也匹配后面的模式。

## 诊断方法论（必读）

1. `curl API` 获取原始回复
2. 在 Node.js VM 中测试 `renderMarkdown()` 输出（browser_console 不可靠）
3. 检查预处理阶段（expanded 数组）是否破坏了标记
4. 检查主循环中哪个分支捕获了该行
5. 最后才怀疑 `inline()` 函数

## 相关参考文件

- `references/md-rendering-pitfalls.md` — 7 大陷阱系统性汇总（v0.9.86）
- `references/markdown-inline-splitting.md` — 行内多元素分割
- `references/markdown-heading-jam-split.md` — Heading Jam 分割
- `references/markdown-preprocessing-deep-fixes.md` — 预处理深度修复
- `references/markdown-bold-table-list-misparse.md` — 加粗+表格误判
- `references/markdown-list-table-fixes.md` — 列表项连在一起
- `references/md-hr-heading-same-line.md` — HR+标题同行
- `references/regex-catastrophic-backtracking.md` — 正则灾难性回溯
- `references/js-emoji-surrogate-pair-regex-pitfall.md` — Emoji 代理对陷阱
