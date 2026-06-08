# MD 渲染器陷阱与修复记录

## renderMarkdown 主循环处理顺序（core.js）

```
code block → text-before-table → table → heading → HR → blockquote → list → paragraph
```

**关键**：排在前面的检测会优先捕获行，即使该行也匹配后面的模式。

## 陷阱 1：无序列表检测误匹配 `**加粗**`

**现象**：`**修炼体系**` 被渲染为斜体而非加粗。

**根因**：无序列表检测正则 `/^[-*+]\s*/` 匹配以 `*` 开头的行，而 `**text**` 以 `*` 开头。

**修复**：在 ul 分支和 ul while 循环中添加排除条件：
```js
if (/^[-*+]\s*/.test(line.trim()) && !/^\*\*/.test(line.trim()) && !/^---+$/.test(line.trim()))
```
while 循环中同样添加：
```js
if (i < lines.length && /^[-*+]\s*/.test(lines[i].trim()) && !/^\*\*/.test(lines[i].trim()))
```

## 陷阱 2：text-before-table 误判 heading

**现象**：`### 对比参考| 模型 | 描述 |` 中 `### 对比参考` 没被识别为标题。

**根因**：text-before-table 检测（`line.includes('|') && !line.trim().startsWith('|')`）在 heading 检测之前执行，提前捕获了该行。

**修复**：添加 heading 排除条件：
```js
if (line.includes('|') && !line.trim().startsWith('|') && !/^#{1,6}\s*/.test(line.trim()))
```

## 陷阱 3：heading jam（标题粘连）

**现象**：`分卷大纲### 第一卷：人界篇` 未被分割为段落+标题。

**修复**：预处理阶段添加 heading jam 分割正则。

## 陷阱 4：`---###` 粘连

**现象**：`---### 对比参考` 未被正确分割为 HR + heading。

**修复**：预处理阶段用正则分割 `---` + heading 粘连行。

## 陷阱 5：行中间 `- ` 被误过滤

**现象**：`**高潮**：- 沈夜白...` 中的 `- ` 被预处理过滤掉。

**修复**：在预处理过滤条件中添加 `hasInlineList` 检查，行中间有 `- ` 时不跳过该行。

## 陷阱 6：ulRe prevChar 过度阻止 CJK 标点

**现象**：中文标点（`：`、`。`、`；`）后的 `- ` 未被分割为列表。

**修复**：将 prevChar 过滤器从"阻止 CJK 标点"改为"只阻止字母/数字/CJK 文字/em-dash"。

## 陷阱 7：tab 转换后 line 变量未更新

**现象**：tab 分隔的文本未被识别为表格。

**修复**：tab→pipe 转换后添加 `line = lines[i]`。

## 诊断方法论

1. `curl API` 获取原始回复
2. 在 Node.js VM 中测试 `renderMarkdown()` 输出
3. 检查预处理阶段（expanded 数组）是否破坏了标记
4. 检查主循环中哪个分支捕获了该行
5. 最后才怀疑 `inline()` 函数

## 测试用例

```js
// 加粗不被误判为列表
renderMarkdown('**修炼体系**')  // → <p><strong>修炼体系</strong></p>

// heading+table 粘连
renderMarkdown('### 对比参考| 模型 | 描述 |\n|------|------|')

// 加粗后跟列表
renderMarkdown('**高潮**：- 沈夜白以现代知识改良军阵\n- 突破修炼瓶颈')

// 加粗后跟有序列表
renderMarkdown('**要开始写正文吗？**告诉我：1. ...\n2. ...')

// 表格后加粗
renderMarkdown('| 角色 | 描述 |\n|------|------|\n| 韩立 | 主角 |\n\n**修炼体系**')
```

## 相关文件

- `core.js`：renderMarkdown 函数（~3496 行）
- `index.html`：版本号需随修改更新
- 版本号格式：`v=20260523x`，每次修改递增字母
