# 表格 Look-Ahead 中的行尾粘连（v20260803j）

## 问题

表格 look-ahead 阶段遇到行尾粘连 non-pipe 文字（如 `---`、heading 等）时，`!cl.trim().endsWith('|')` 直接 `break`，导致：
1. 粘连行本身的数据行丢失（未被加入 tableRows）
2. 粘连的 trailing text 形成新的独立表格

典型案例：LLM 输出中表格末尾粘连 horizontal rule：
```
| 证据类型 | 说明|
|----------|------|
|劳动合同 | 证明劳动关系 |
|工资条/银行流水 | 证明欠薪金额 || 考勤记录| 证明工作时间|
| 单位注销证明| 如已注销，从公示系统打印|
| 工作证/工牌 |辅助证明 |---
```

最后一行 `| 工作证/工牌 |辅助证明 |---` 中 `---` 是下一个 section 的 horizontal rule。

## 根因

look-ahead 循环中的终止条件：
```javascript
if (!cl.trim().endsWith('|')) break;  // 直接 break，没有先尝试分割
```

主循环中的 TRAILING_TBL 检测（3509-3528 行）只处理主循环 `i` 指针所在的行，**不处理 look-ahead 中 `j` 指针扫描到的行**。

## 修复

在 look-ahead 中，当 `!cl.trim().endsWith('|')` 时，先尝试 trailing text 分割：

```javascript
if (!cl.trim().endsWith('|')) {
  const trimmed = cl.trim();
  // 检查是否是表格行+粘连文字（至少 3 个 pipe = 2 列）
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  if (pipeCount >= 3) {
    // 从右往左找最后一个后面不再有 | 的 pipe
    let trailPipe = -1;
    for (let p = trimmed.length - 1; p >= 0; p--) {
      if (trimmed[p] === '|' && !trimmed.substring(p + 1).includes('|')) {
        trailPipe = p; break;
      }
    }
    if (trailPipe > 0) {
      const tablePart = trimmed.substring(0, trailPipe + 1).trim();
      const trailingText = trimmed.substring(trailPipe + 1).trim();
      // 替换当前行为 tablePart，trailingText 插入到后面
      lines.splice(j, 1, tablePart, trailingText);
      cl = tablePart; // 继续处理 tablePart
    } else { break; }
  } else { break; }
}
```

## 关键区别

| 场景 | 位置 | 处理方式 |
|------|------|----------|
| 主循环中的粘连 | `i` 指针 | TRAILING_TBL 检测 + `continue` |
| look-ahead 中的粘连 | `j` 指针 | 内联分割 + `lines.splice(j, 1, tablePart, trailingText)` |

## 验证用例

```javascript
(function() {
  const md = `| 证据类型 | 说明|
|----------|------|
|劳动合同 | 证明劳动关系 |
|工资条/银行流水 | 证明欠薪金额 || 考勤记录| 证明工作时间|
| 单位注销证明| 如已注销，从公示系统打印|
| 工作证/工牌 |辅助证明 |---`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  const tables = d.querySelectorAll('table');
  return JSON.stringify({
    tableCount: tables.length,
    lastTableRowCount: tables[0] ? tables[0].querySelectorAll('tr').length : 0,
    hasHR: !!d.querySelector('hr')
  });
})()
// 期望: {tableCount: 1, lastTableRowCount: 6, hasHR: true}
// 修复前: {tableCount: 2, lastTableRowCount: 5, hasHR: false}
```

## 相关文件

- `references/markdown-table-trailing-text.md` — 主循环中的行尾粘连修复（v=20260523k）
- `references/markdown-table-test-suite.md` — 表格渲染测试套件
