# 流式回复调试：stream_chunk 为 0 的排查流程

**验证日期：2026-05-16**

## 问题现象

前端收到 `stream_start` 后直接收到 `stream_end`（或 `response`），中间没有任何 `stream_chunk` 消息。用户看到的是"一次性弹出完整回复"而非"逐字显示"。

## 浏览器控制台验证方法

```javascript
// 1. 拦截 WS 消息，统计 stream_chunk 数量
window._testChunks = [];
const origMsg = ws.onmessage;
ws.onmessage = function(e) {
  const d = JSON.parse(e.data);
  if (d.type === 'stream_chunk') window._testChunks.push(d.delta);
  origMsg.call(ws, e);
};

// 2. 发送测试消息
ws.send(JSON.stringify({type: 'message', content: '测试流式', session_id: currentSession}));

// 3. 等待 10-15 秒后检查
JSON.stringify({chunkCount: window._testChunks.length, totalLen: window._testChunks.join('').length})
// 正常：chunkCount > 0，totalLen > 0
// 异常：chunkCount == 0（流式完全不工作）
```

## 根因链路

```
API 返回空 SSE 流（HTTP 200 但无 data: 行）
  → llm_client.py chunk_count==0, received_done==False
  → 触发空响应重试（最多 3 次，退避 5→10→20s）
  → 重试耗尽后 yield {"delta": "[LLM API 错误：流式响应连续 3 次为空]", "finish_reason": "error"}
  → agent.py _llm_call 流式分支：collected_content 为空列表
  → stream_callback 从未被调用（因为没有任何 delta 有内容）
  → siper_web.py stream_started == False
  → 走非流式分支发送 response 消息
  → 前端显示完整文本（非逐字）
```

**关键点**：`stream_callback` 只在 `delta` 有内容时才被调用。如果 SSE 流中所有 chunk 的 `delta.content` 都是空字符串（或 SSE body 完全为空），`stream_callback` 永远不会被调用，`stream_started` 保持 False。

## 两种空流场景

| 场景 | chunk_count | received_done | stream_callback 调用？ | 表现 |
|------|-------------|---------------|----------------------|------|
| SSE body 完全为空 | 0 | False | 否 | 重试 3 次后报错 |
| 有效 SSE 但所有 delta.content="" | >0 | True | 否 | 不触发重试，返回空 content |

**注意**：场景 2 不会触发 llm_client 层的空响应重试（因为 chunk_count>0 或 received_done=True），但 agent.py 层的空 content 检测（v0.6.4）会捕获并重试 1 次。

## 排查步骤

1. **确认 stream_chunk 数量**：用上述浏览器控制台方法
2. **检查后端日志**：搜索 `LLM 流式请求返回空响应` 或 `流式响应连续 3 次为空`
3. **检查 siper 进程是否重启**：代码修改后必须重启进程，否则旧代码仍在运行
4. **检查 conversation_history 长度**：`_build_context` 取 `self.conversation_history[-20:]`，如果历史太长可能导致 context 超限

## 进程重启检查（重要）

**代码修改后必须重启 siper 进程**。验证方法：

```bash
# 检查进程运行时间
ps -o pid,etime,cmd -p $(cat /home/gavin/.siper/siper.pid) --no-headers
# 如果运行时间过长（>1小时）且期间有代码修改，需要重启
```

**陷阱**：siper 由 hermes gateway 管理时（`hermes gateway run --profile siper`），kill 后会被 gateway 自动重启。需要确认重启后的新进程加载了新代码。

## 关联陷阱

- `streaming-empty-response-fix.md` — SSE body 完全为空的场景
- `llm-empty-content-valid-sse.md` — 有效 SSE 但 content 全为空
- `llm-retry-pattern.md` — 所有重试模式汇总
