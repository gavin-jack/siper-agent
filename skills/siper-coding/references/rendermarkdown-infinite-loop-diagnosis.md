# renderMarkdown 无限循环诊断指南

## 症状识别

| 症状 | 可能原因 |
|------|---------|
| 页面加载后所有 UI 无响应 | JS 主线程阻塞 |
| 浏览器控制台按回车无响应 | JS 死循环（不是慢） |
| 弹出某个 toast 后卡死 | 该 toast 触发链中的函数有问题 |
| 页面显示"加载中"不消失 | typing indicator 未隐藏（isSending 未重置） |
| 显示"[渲染超时]" | renderMarkdown 安全计数器触发 |

## 诊断步骤

### 1. 确认是 JS 死循环（不是网络）

- SiPer API 正常（curl localhost:9724/api/version 返回 200）
- 浏览器控制台完全无响应 = JS 主线程死循环

### 2. 定位触发消息

安全计数器触发后，控制台会输出：
```
renderMarkdown: SAFETY STOP after 5000 iterations, i=XXX, lines=YYY, text:"..."
  line[i]: "..."
  line[i+1]: "..."
```

关键信息：
- text 字段 = 触发无限循环的完整消息文本
- line[i] = 循环卡住时的那一行

### 3. Node.js 模拟复现

```javascript
const lines = problemText.split('\n');
let i = 0, count = 0;
while (i < lines.length) {
  if (++count > 5000) { console.log('INFINITE LOOP at i=', i); break; }
  let line = lines[i];
  if (!line) { i++; continue; }
}
```

注意：Node.js 模拟可能无法复现浏览器环境问题。

## 已知触发场景

1. **i-- 越界**（已修复 v20260803o）：inline heading split 中 i=0 时 i-- 变 -1
2. **动态 _maxIter**（已修复 v20260803r）：lines.length * 10 随 splice 增长
3. **未知场景**：某些 LLM 输出格式可能导致循环次数超过 5000

## 修复模式

固定上限 + 循环检查 + splice 后索引守卫。

## 长期方案

异步分批渲染会话历史，每 5 条消息 await setTimeout(r, 0) 让出主线程。
