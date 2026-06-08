# MD 表格渲染测试套件（v0.9.70+）

## 用途
验证 `renderMarkdown()` 表格渲染逻辑的正确性。在 `browser_console` 中逐段执行。

## 前置条件
1. `browser_navigate` 加载 `http://127.0.0.1:9724/`
2. 确认 `typeof renderMarkdown === 'function'`
3. 确认 `renderMarkdown.toString().length > 20000`（防止函数被覆盖）

## 快速测试模板
```javascript
(function() {
  const md = `测试文本`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return d.innerHTML;
})()
```

## 测试用例

### T1: text + 表格同行（原始 bug）
```javascript
(function() {
  const md = `你的显卡信息如下：| 项目| 详情 ||------|------|\n| **型号** | Intel®Iris®Xe Graphics || **显存**| 1 GB |\n| **驱动版本** |31.0.101.4502 |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  const t = d.querySelector('table');
  return JSON.stringify({hasTable: !!t, rows: t ? t.querySelectorAll('tr').length : 0, hasP: !!d.querySelector('p'), pText: d.querySelector('p') ? d.querySelector('p').textContent : ''});
})()
// 期望: {hasTable: true, rows: 4, hasP: true, pText: "你的显卡信息如下："}
```

### T2: 标准 MD 表格
```javascript
(function() {
  const md = `| A | B | C |\n|------|------|------|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  const t = d.querySelector('table');
  const rows = t ? Array.from(t.querySelectorAll('tr')) : [];
  return JSON.stringify({hasTable: !!t, rowCount: rows.length, headers: rows[0] ? Array.from(rows[0].querySelectorAll('th')).map(c=>c.textContent) : []});
})()
// 期望: {hasTable: true, rowCount: 3, headers: ["A","B","C"]}
```

### T3: header + separator 同行
```javascript
(function() {
  const md = `| 项目 | 详情 ||------|------|\n| 型号 | Intel |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  const t = d.querySelector('table');
  return JSON.stringify({hasTable: !!t, rows: t ? t.querySelectorAll('tr').length : 0});
})()
// 期望: {hasTable: true, rows: 2}
```

### T4: || 多行分隔
```javascript
(function() {
  const md = `| A | B || C | D ||\n| 1 | 2 || 3 | 4 |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  const t = d.querySelector('table');
  return JSON.stringify({hasTable: !!t, rows: t ? t.querySelectorAll('tr').length : 0});
})()
// 期望: {hasTable: true, rows: 4}
```

### T5: 单 | 文本（不应渲染为表格）
```javascript
(function() {
  const md = `Use | for piping`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({hasTable: !!d.querySelector('table'), isP: !!d.querySelector('p')});
})()
// 期望: {hasTable: false, isP: true}
```

### T6: 行内代码中的 |（不应渲染为表格）
```javascript
(function() {
  const md = `\`code | pipe\``;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({hasTable: !!d.querySelector('table'), isP: !!d.querySelector('p')});
})()
// 期望: {hasTable: false, isP: true}
```

### T7: 标题 + 表格混合
```javascript
(function() {
  const md = `## 配置 | 项目 | 值 |\n|------|-----|\n| CPU | i7 |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({hasH2: !!d.querySelector('h2'), h2Text: d.querySelector('h2') ? d.querySelector('h2').textContent : '', hasTable: !!d.querySelector('table')});
})()
// 期望: {hasH2: true, h2Text: "配置", hasTable: true}
```

### T8: 多个独立表格
```javascript
(function() {
  const md = `| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({tableCount: d.querySelectorAll('table').length});
})()
// 期望: {tableCount: 2}
```

### T9: 表格后跟列表
```javascript
(function() {
  const md = `| A | B |\n|---|---|\n| 1 | 2 |\n\n- item1\n- item2`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({hasTable: !!d.querySelector('table'), hasList: !!d.querySelector('ul'), liCount: d.querySelectorAll('li').length});
})()
// 期望: {hasTable: true, hasList: true, liCount: 2}
```

### T10: 仅分隔符行（不应渲染为表格）
```javascript
(function() {
  const md = `|---|---|`;
  const r = renderMarkdown(md);
  const d = document.createElement('div');
  d.appendChild(r);
  return JSON.stringify({hasTable: !!d.querySelector('table')});
})()
// 期望: {hasTable: false}
```

### T11: 综合测试（10 合 1）
```javascript
(function() {
  const tests = [];
  
  // text before table
  (function() {
    const md = `你的显卡信息如下：| 项目| 详情 ||------|------|\n| **型号** | Intel®Iris®Xe Graphics || **显存**| 1 GB |\n| **驱动版本** |31.0.101.4502 |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    const t = d.querySelector('table');
    tests.push({name: 'text-before-table', pass: !!t && t.querySelectorAll('tr').length === 4 && d.querySelector('p')});
  })();
  
  // standard table
  (function() {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    const t = d.querySelector('table');
    tests.push({name: 'standard-table', pass: !!t && t.querySelectorAll('tr').length === 2});
  })();
  
  // header+sep same line
  (function() {
    const md = `| h1 | h2 ||---|---|\n| a | b |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    const t = d.querySelector('table');
    tests.push({name: 'header-sep-same-line', pass: !!t && t.querySelectorAll('tr').length === 2});
  })();
  
  // multi-row ||
  (function() {
    const md = `| A | B || C | D ||\n| 1 | 2 || 3 | 4 |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    const t = d.querySelector('table');
    tests.push({name: 'multi-row-pipe', pass: !!t && t.querySelectorAll('tr').length === 4});
  })();
  
  // single pipe (no table)
  (function() {
    const md = `Use | for piping`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'single-pipe-no-table', pass: !d.querySelector('table')});
  })();
  
  // code pipe (no table)
  (function() {
    const md = `\`code | pipe\``;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'code-pipe-no-table', pass: !d.querySelector('table')});
  })();
  
  // heading+table
  (function() {
    const md = `## Title | A | B |\n|---|---|\n| 1 | 2 |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'heading-table', pass: !!d.querySelector('h2') && !!d.querySelector('table')});
  })();
  
  // multiple tables
  (function() {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'multiple-tables', pass: d.querySelectorAll('table').length === 2});
  })();
  
  // table then list
  (function() {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |\n\n- item1\n- item2`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'table-then-list', pass: !!d.querySelector('table') && !!d.querySelector('ul')});
  })();
  
  // sep only (no table)
  (function() {
    const md = `|---|---|`;
    const d = document.createElement('div'); d.appendChild(renderMarkdown(md));
    tests.push({name: 'sep-only-no-table', pass: !d.querySelector('table')});
  })();
  
  const passed = tests.filter(t => t.pass).length;
  return JSON.stringify({total: tests.length, passed, failed: tests.length - passed, details: tests});
})()
// 期望: {total: 10, passed: 10, failed: 0}
```

## 已知边缘情况（不修复）

| 场景 | 行为 | 原因 |
|------|------|------|
| LLM 输出中代码片段紧接文字后（无换行） | 代码中的 `\|` 可能被误判为表格 | LLM 输出不规范，预处理阶段无法区分 |
| `*text*` 单独一行 | 可能被误判为无序列表 | 预处理阶段 `*filename` 转换正则的副作用 |

## 相关文件
- `references/markdown-table-text-prefix-fix.md` — text-before-table 修复详情
- `references/markdown-rendering-fixes.md` — 渲染修复总览
