# 行内 Heading 分割 — text### Title 模式

## 问题

LLM 输出中 heading 经常与前面文字粘连，无换行无空格：

```
五、分卷大纲### 第一卷：长安鬼案（约25万字）
##1. send_message工具参数为空
```

旧 heading 检测正则 `/^(#{1,6})\s*(.*)/` 只匹配行首的 `#`，导致整行被当作普通段落。

## 修复

在 text-before-table 检测之前，添加行内 heading 拆分预处理：

```javascript
// Inline heading split: "text### Title" → split into "text" + "### Title"
// v20260803m: changed \s+ to \s* to support "##1." format (no space after #)
const inlineH = line.match(/^(.*?)(\#{1,6}\s*.+)$/);
if (inlineH && inlineH[1].trim() && inlineH[2].trim() && !/#$/.test(inlineH[1].trim())) {
  lines.splice(i, 1, inlineH[1].trim(), inlineH[2].trim());
  i--;
  continue;
}
```

## 关键陷阱：7+ 个 `#`

正则 `/^(.*?)(\#{1,6}\s*.+)$/` 对于 `####### 标题`（7个#）：
- `(.*?)` 匹配 `"#"`（1个#，非贪婪回溯后）
- `#{1,6}` 匹配 `"######"`（6个#）
- 结果：拆成 `"#"` + `"###### 标题"`

**修复**：添加条件 `!/#$/.test(inlineH[1].trim())`，确保前面文字不以 `#` 结尾。

## 关键陷阱：i-- 导致 i = -1

当 inline heading split 在 `i = 0` 处执行时，`lines.splice(0, 1, ...)` 后 `i--` 使 `i = -1`。
下一轮循环 `lines[-1]` 是 `undefined`，`line.match(...)` 报错 `Cannot read properties of undefined (reading 'match')`。

**修复**：`i--` 后添加 `if (i < 0) i = 0;`

```javascript
lines.splice(i, 1, inlineH[1].trim(), inlineH[2].trim());
i--;
if (i < 0) i = 0;  // ← 必须添加
continue;
```

**同样适用于 inline ordered list split**（line 3751 的 `i--` 也有同样问题）。

## 边界情况

| 输入 | 拆分结果 | 说明 |
|------|---------|------|
| `text### 标题` | `text` + `### 标题` | 正常拆分 |
| `text##1. Heading` | `text` + `##1. Heading` | v20260803m: \s* 支持无空格 |
| `text####### 标题` | 不拆分，整行处理 | 7#不是有效heading |
| `####### 标题` | 不拆分，整行处理 | 7#不是有效heading |
| `text# 标题` | `text` + `# 标题` | 单#也是heading |
| `### 标题` | 不拆分（inlineH[1]为空） | 走正常heading检测 |
| `---### 标题` | `---` + `### 标题` | HR + heading |
| `---### 标题\|col\|` | `---` + `### 标题\|col\|` | HR + heading+table |

## 执行顺序

1. **行内 heading 拆分**（最先执行）
2. text-before-table 检测
3. table 检测
4. heading 检测（行首 `#`）
5. HR / blockquote / list / paragraph

## 版本

- v0.9.87+：初始实现，`\s+` 要求 `#` 后有空格
- v20260803m：改为 `\s*`，支持 `##1.` 格式（`#` 后无空格）
