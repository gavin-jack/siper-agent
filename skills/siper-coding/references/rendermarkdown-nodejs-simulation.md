# renderMarkdown 简化 Node.js 模拟测试

## 背景

当 browser 不可用时，可以用直接在 Node.js 中模拟 renderMarkdown 的核心逻辑来验证修复。
不需要完整的 VM 沙箱或 DOM mock — 只需复制关键循环逻辑。

## 方法

### 1. 定位代码

```bash
grep -n 'function renderMarkdown\|while.*lines.length\|i--\|lines.splice' core.js | head -30
```

### 2. 编写模拟脚本

```javascript
const fs = require('fs');

// 读取 core.js 用于参考
const code = fs.readFileSync('/home/gavin/.siper/webui/static/pages/core.js', 'utf-8');

// 待测试的文本
const text = '您的测试文本';

// 模拟 pre-processing（按需添加）
let lines = text.split('\n');
let expanded = [];
for (let li = 0; li < lines.length; li++) {
  let l = lines[li];
  // ... 复制预处理逻辑 ...
  expanded.push(l);
}
lines.length = 0;
lines.push(...expanded);

// 模拟主循环
let i = 0;
let iterations = 0;
const maxIterations = 200;
const result = [];

while (i < lines.length && iterations < maxIterations) {
  iterations++;
  let line = lines[i];

  // Guard: undefined check
  if (typeof line === 'undefined') {
    console.error('UNDEFINED at index', i, 'of', lines.length);
    console.error('lines:', JSON.stringify(lines));
    break;
  }

  // ... 复制核心分支逻辑 ...
  // 每个分支用 continue 或 i++ 推进

  i++; // fallback
}

if (iterations >= maxIterations) {
  console.error('Infinite loop detected!');
} else {
  console.log(`OK: ${iterations} iterations, ${result.length} elements`);
}
```

### 3. 运行

```bash
node /tmp/test_sim.js
```

## 关键检查点

1. **undefined 检查**：`typeof line === 'undefined'` 应在循环开头
2. **迭代上限**：设置 `maxIterations = 200` 防止无限循环
3. **i-- 后检查**：每次 `i--` 后检查 `if (i < 0) i = 0;`
4. **splice 参数**：确保 splice 插入的元素都不是 undefined

## 适用场景

- browser CDP 超时无法调试时
- 验证 renderMarkdown 修复是否有效
- 测试新的 markdown 格式是否正确渲染

## 版本

v20260803p 创建
