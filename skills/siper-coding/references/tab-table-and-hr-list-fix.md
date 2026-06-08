# Tab 分隔表格自动转换 + `---` 列表排除

## 问题描述

LLM 输出中常见两种格式问题：

1. **Tab 分隔伪表格**：用 tab 对齐列，renderMarkdown 只识别 `|` 分隔
2. **`---` 被误判为无序列表**：`/^[-*+]\s*/` 匹配 `---`

## Tab → Pipe 转换代码

在 `while (i < lines.length)` 循环顶部、`let line = lines[i]` 之前：

```js
if (lines[i] && !lines[i].includes('|') && lines[i].includes('\t') && !lines[i].match(/^```/)) {
  const cols = lines[i].split('\t').filter(c => c.trim());
  if (cols.length >= 2 && cols.every(c => c.trim().length < 40)) {
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextHasTab = nextLine.includes('\t') && !nextLine.match(/^```/);
    const prevHasTab = prevLine.includes('\t') && !prevLine.match(/^```/);
    if (nextHasTab || prevHasTab || (cols.length === 2 && cols.every(c => c.trim().length < 30))) {
      let j = i;
      while (j < lines.length && lines[j].includes('\t') && !lines[j].match(/^```/)) {
        const parts = lines[j].split('\t').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.every(p => p.length < 40)) {
          lines[j] = '| ' + parts.join(' | ') + ' |';
        }
        j++;
      }
    }
  }
}
```

## 列表排除 `---`

```js
// if 和 while 都加
&& !/^---+$/.test(line.trim())
```

诊断：看到 `LI: --` 就是此 bug。
