# Markdown Heading Jam Split — LLM 非标准格式修复

## 问题描述

LLM 输出中 heading 粘连的两种模式：

### 模式1：Heading + Heading 粘连
```
###🧠 五、推荐模型选择####中文场景
```
两个 `#` 段落直接相连，无换行。原 heading 分割正则 `/(?:^|[^#])(#{1,6})\s*[^#]/g` 要求 `#` 后有 `\s*`，但 emoji 和中文不触发 `\s`，导致分割失败。

### 模式2：表格行 + Heading 粘连
```
| **70B** |40GB+| 双卡| 不推荐纯CPU |#### 你的显卡能跑多大模型？
```
表格行末尾 `|` 后直接跟 `####` 标题，标题被塞进表格最后一个 cell。

### 模式3：Heading + 内容粘连
```
####中文场景模型参数特点Qwen2.57B/14B...
```
`####` 后直接跟中文，heading 文本和表格数据无法区分。

## 修复方案

### 1. headingJamMatch — Heading + Heading 分割

在 `renderMarkdown` 的预处理阶段，在 `fenceHeadingMatch` 之后添加：

```javascript
// Split heading jammed after heading: ###text####text → ###text + ####text
// ⚠️ 必须用 \s*[^#\n].*? 而非 [^\n#]*?，否则懒惰匹配会导致 ## Title 被错误分割为 "#" + "# Title"
var headingJamMatch = l.trim().match(/^(#{1,6}\\s*[^#\\n].*?)(#{1,6}\\s*\\S.*)$/);
if (headingJamMatch) {
  var firstHeading = headingJamMatch[1].trim();
  var secondPart = headingJamMatch[2].trim();
  if (firstHeading.match(/^#{1,6}\\s*/) || firstHeading.length >= 4) {
    expanded.push(firstHeading);
    // Extract heading portion from secondPart: # + 3-4 CJK chars
    var secondHeadingMatch = secondPart.match(/^(#{1,6}[\\u4e00-\\u9fff]{3,4})/);
    if (!secondHeadingMatch) secondHeadingMatch = secondPart.match(/^(#{1,6}[\\w]{2,8})/);
    if (secondHeadingMatch) {
      expanded.push(secondHeadingMatch[1]);
      var rest = secondPart.substring(secondHeadingMatch[1].length).trim();
      if (rest) expanded.push(rest);
    } else {
      expanded.push(secondPart);
    }
    continue;
  }
}
```

关键：
- 正则 `/^(#{1,6}\\s*[^#\\n].*?)(#{1,6}\\s*\\S.*)$/` 要求第一部分至少有一个非 `#` 字符
- 旧正则 `[^\\n#]*?` 懒惰匹配会在 `## Title` 上错误分割为 `"#"` + `"# Title"`
- 第二个 heading 部分进一步提取：`# + 3-4 个中文字符` 或 `# + 2-8 个单词字符`
- 剩余部分（如表格数据）作为普通文本 push

**⚠️ 正则陷阱（v0.9.85 修复）**：`[^\n#]*?` 懒惰匹配 + lookahead 回溯 = 第一个捕获组只匹配到最少的字符。对于 `## Title`，`#{1,6}` 匹配 `##`，然后 `[^\n#]*?` 懒惰匹配空字符串，lookahead `(?=#{1,6}\s*\S.*)$` 从 `T` 开始无法匹配 `#`，于是回溯让 `[^\n#]*?` 匹配 `T`，继续尝试...最终把 `#` 单独切出来。解决方案：用 `\s*[^#\n].*?` 强制要求至少一个非 `#` 字符。

### 2. tableHeadingMatch — 表格行 + Heading 分割

```javascript
// Split |#### pattern: table row jammed with heading
var tableHeadingMatch = l.trim().match(/^(.*\|)\s*(#{1,6}\s*.*)$/);
if (tableHeadingMatch) {
  var beforePipe = tableHeadingMatch[1].trim();
  var afterPipe = tableHeadingMatch[2].trim();
  if (beforePipe && afterPipe.match(/^#{1,6}/)) {
    expanded.push(beforePipe);
    expanded.push(afterPipe);
    continue;
  }
}
```

### 3. 中文 heading 长度限制

对于 `####中文场景模型参数特点` 这种 heading+数据粘连的情况：
- 限制中文 heading 文本为 **3-4 个中文字符**
- `中文场景` = 4 字符 → heading
- `模型参数特点` = 6 字符 → 剩余文本（表格数据）
- 英文 heading 限制为 **2-8 个单词字符**

## 测试用例

```javascript
// Test cases
renderMarkdown('###🧠 五、推荐模型选择####中文场景');
// → <h3>🧠 五、推荐模型选择</h3><h4>中文场景</h4>

renderMarkdown('###🧠 五、推荐模型选择####中文场景模型参数特点');
// → <h3>🧠 五、推荐模型选择</h3><h4>中文场景</h4><p>模型参数特点</p>

renderMarkdown('| **70B** |40GB+| 双卡| 不推荐纯CPU |\n#### 你的显卡能跑多大模型？');
// → table with 4 cells + <h4>你的显卡能跑多大模型？</h4>
```

## 版本历史

- v0.9.85 (2026-05-23): 新增 headingJamMatch 和 tableHeadingMatch
- v0.9.85b (2026-05-26): 修复 headingJamMatch 正则懒惰匹配 bug — `[^\n#]*?` → `\s*[^#\n].*?`，解决 `## Title` 被错误分割的问题
