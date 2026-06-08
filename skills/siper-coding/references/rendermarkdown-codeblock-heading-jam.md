# renderMarkdown Code Block + Heading Jam 分割 Bug

## 问题描述

LLM 输出中 heading 与 opening code fence 粘连在同一行：

```
###👥核心人物关系```赵宁────团队创始人/第一季领导者
│├──与小宝有暧昧（无疾而终）
...
```###💡人物特点速览
```

renderMarkdown 的代码块提取正则能匹配这个代码块，但 heading jam 拆分后，code block placeholder 和 heading 在同一行：

```
###👥核心人物关系\x00CODEBLOCK0\x00
```

渲染循环中的 code block placeholder 检测（第 3147 行）要求**整行**都是 `\x00CODEBLOCKn\x00`，导致 code block 不显示。

## 修复方案

在 heading jam 拆分时（第 2993 行附近），如果第一行包含 code block placeholder，把 placeholder 单独拆出来：

```javascript
var cbInHeading = firstHeading.match(/^(.*?)(\x00CODEBLOCK\d+\x00)(.*)$/);
if (cbInHeading) {
  if (cbInHeading[1].trim()) expanded.push(cbInHeading[1].trim());
  expanded.push(cbInHeading[2]);  // placeholder 单独一行
  if (cbInHeading[3].trim()) {
    var remainder = cbInHeading[3].trim();
    var remJam = remainder.match(/^(#{1,6}\s*[^#\n].*?)(#{1,6}\s*\S.*)$/);
    if (remJam) {
      expanded.push(remJam[1].trim());
      expanded.push(remJam[2].trim());
    } else {
      expanded.push(remainder);
    }
  }
  expanded.push(secondPart);
  continue;
}
```

## 关键陷阱

1. **placeholder 检测正则**：`/^\x00CODEBLOCK(\d+)\x00$/` 要求整行都是 placeholder
2. **expanded 替换 lines**：`lines.length = 0; lines.push(...expanded)` 在 for 循环之后
3. **渲染循环**：`while (i < lines.length)` 从 i=0 开始处理新 lines

## Git Commit

- `fc428c0` — fix: split code block placeholder from heading in renderMarkdown
