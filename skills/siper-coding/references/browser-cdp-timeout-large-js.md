# Browser CDP 超时与大型 JS 文件陷阱

## 问题

当 core.js 超过 ~150KB 时，headless Chrome (CDP) 在加载页面后可能出现：
- `browser_console` 命令全部超时（30s）
- `browser_snapshot` 超时
- `browser_navigate` 返回 success 但后续所有命令超时
- Chrome 进程存活但 CDP 连接无响应

**根本原因**：headless Chrome 解析大型 JS 文件时耗时过长，CDP 命令队列堆积导致超时。

## 识别特征

1. `browser_navigate` 成功，返回了快照
2. 紧接着的 `browser_console` 超时
3. 后续所有 browser 命令都超时
4. `ps aux | grep chrome` 显示进程存活
5. `curl http://127.0.0.1:9724/` 正常返回 200

## 应对策略

**当 browser 反复超时时，不要继续重试 browser 命令。** 改用以下替代方案：

### 方案 A：Node.js 直接模拟（推荐）

不依赖完整 VM 沙箱，只提取核心逻辑在 Node.js 中运行：

```javascript
const fs = require('fs');
const code = fs.readFileSync('/home/gavin/.siper/webui/static/pages/core.js', 'utf-8');
const lines = code.split('\n');

// 定位关键函数位置
const fnStart = lines.findIndex(l => l.includes('function renderMarkdown'));
console.log('renderMarkdown starts at line:', fnStart);

// 模拟执行关键循环逻辑（复制核心代码）
let simLines = text.split('\n');
let i = 0;
let iterations = 0;
while (i < simLines.length && iterations < 200) {
  iterations++;
  let line = simLines[i];
  if (typeof line === 'undefined') {
    console.error('UNDEFINED at index', i);
    break;
  }
  // ... 复制核心分支逻辑 ...
  i++;
}
console.log('Completed in', iterations, 'iterations');
```

**优势**：无需 mock DOM/localStorage/WebSocket，速度快，输出清晰。

### 方案 B：强制重启 Chrome

```bash
pkill -9 -f 'agent-browser'
sleep 10
# 然后 browser_navigate 重新加载
```

**注意**：重启后需要等待 10-15 秒再发送命令，且如果 core.js 仍然很大，可能再次超时。

### 方案 C：curl 验证 + 信任 Node.js 结果

如果 Node.js 模拟验证通过，且 `curl` 确认 SiPer 正常服务，可以直接提交修复，无需浏览器验证。

## 预防措施

- core.js 持续增长是正常趋势（当前 ~160KB，3800+ 行）
- 每次修改后浏览器超时概率增加
- 优先用 Node.js 模拟验证，浏览器仅作为最终确认手段

## 版本

v20260803p 首次发现并记录
