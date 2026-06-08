# Typing 指示器时序修复（v0.9.66+）

## 用户要求
"正在思考"在消息**完整渲染完毕**后才消失（包括 content + meta + attachments + debug block），不是在第一个 stream_delta 时隐藏。

## 修复方案

### stream_delta 处理
**不隐藏 typing**。之前加的"第一个 delta 就隐藏 typing"的代码必须删除：
```js
// ❌ 删除这段（stream_delta 中不要隐藏 typing）
// const _te = document.getElementById('typing');
// if (_te) _te.className = 'typing';
```

### stream_end 处理
typing 隐藏移到**所有渲染完成之后**：
```js
// 正确顺序：
// 1. 用 _streamAcc 做最后一次 MD 渲染
// 2. 追加 meta（usage/tools/skills/time）
// 3. 渲染 tool calls
// 4. 渲染 attachments
// 5. 渲染 debug block
// 6. 更新 token 统计
// 7. 隐藏 typing ← 在这里
const _te = document.getElementById('typing');
if (_te) _te.className = 'typing';
```

### response（非流式）处理
typing 隐藏移到 `addMsg()` 和 `playReplySound()` **之后**：
```js
// 正确顺序：
// 1. addMsg(content) — 渲染消息气泡
// 2. playReplySound() — 播放提示音
// 3. 隐藏 typing ← 在这里
const _te = document.getElementById('typing');
if (_te) _te.className = 'typing';
```

## 验证方法
1. 发送消息 → 确认 "正在思考" 显示
2. 等待回复完成 → 确认 "正在思考" 在 meta 显示后才消失
3. 检查：`document.getElementById('typing').className === 'typing'`（无 active）

## 常见陷阱
- 不要在 stream_delta 中隐藏 typing（太早）
- 不要在 stream_end 开头隐藏 typing（meta 还没渲染）
- 不要在 addMsg 之前隐藏 typing（非流式模式）
