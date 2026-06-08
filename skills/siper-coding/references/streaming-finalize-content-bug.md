# 流式消息 finalize 陷阱：stream_end content 被忽略

## 现象

用户发送消息后，Agent 回复只显示了流式传输的中间文字（如"让我看看当前时间。"），但最终答案没有出现。

## 根因

当 LLM 流式返回文字后发起工具调用（如 execute_command 获取时间），流程如下：

1. LLM 流式返回 "让我看看当前时间。" → 前端 `stream_chunk` 逐字显示
2. LLM 返回 tool_calls → 后端执行工具
3. 后端二次 LLM 调用得到最终答案
4. 后端发送 `stream_end`，其中 `content` = 最终答案
5. 前端 `_finalizeStreamMsg()` **只添加 meta 和 action 按钮，没有更新 bodyEl 的文本**

结果：用户只看到流式中间文字 + 统计信息，看不到最终答案。

## 代码位置

`webui/static/pages/core.js` → `_finalizeStreamMsg(bodyEl, data)`

## 修复方案

在 `_finalizeStreamMsg` 中，如果 `data.content` 存在且与当前 bodyEl 文本不同，更新文本：

```javascript
function _finalizeStreamMsg(bodyEl, data) {
  const row = bodyEl.closest('.msg-row');
  if (!row) return;
  const bubble = bodyEl.closest('.msg.agent-bubble') || bodyEl.closest('.agent-bubble');
  if (!bubble) return;

  // ★ 关键修复：用 stream_end 的最终内容替换流式累积的中间文字
  if (data.content && data.content !== bodyEl.textContent) {
    bodyEl.textContent = data.content;
  }

  // Build meta for stats display
  const meta = {
    usage: data.usage,
    tools_used: data.tools_used,
    tool_call_steps: data.tool_call_steps || [],
    skills_active: data.skills_active,
    processing_time_ms: data.processing_time_ms,
  };
  if (typeof appendMeta === 'function') {
    appendMeta(bubble, meta);
  }

  // Add action buttons below bubble (copy + insert)
  if (typeof buildActionsForStream === 'function') {
    buildActionsForStream(bubble);
  }

  // Scroll to bottom
  const chatEl = document.getElementById('chatMessages');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}
```

## 触发条件

- LLM 先流式输出文字，然后调用工具
- 工具调用后的二次 LLM 生成最终答案
- 最终答案与流式中间文字不同

## 影响范围

所有涉及工具调用的对话（如"几点了"、"搜索一下..."、"运行一下..."等）都会受影响。纯文字回复（无工具调用）不受影响，因为流式文字就是最终答案。

## 后端流程参考

```
_process_ws_message()
  → agent.process_message(stream_callback=_send_stream_chunk)
    → _llm_call(streaming=True)  → 返回 content + tool_calls
    → _handle_tool_calls()       → 执行工具 + 二次 LLM 调用
  → stream_end = {content: 最终答案, stats_line, usage, ...}
  → ws.send(stream_end)
```

关键：stream_end.content 是 `_handle_tool_calls` 之后的最终响应，不是流式阶段累积的文字。

## 相关陷阱：流式错误消息的 textContent 设置

当 LLM 流式请求失败（如空响应、HTTP 错误），后端可能在没有任何 `stream_chunk` 的情况下直接发送 `stream_end`（`is_error: true`, `d.content` 含错误消息）。此时 bodyEl 为空，需要显式设置文本：

```javascript
// stream_end 的 is_error 分支中
if (d.content) {
  _streamCurrentMsgEl.textContent = d.content;
}
```

同时注意：后端流式 error delta 不应包含 `\n` 前缀，否则 `white-space: pre-wrap` 会渲染出空白行。详见 `references/llm-error-display-pattern.md`。
