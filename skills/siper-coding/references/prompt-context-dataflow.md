# Prompt Context 数据流：从 agent.py 到前端弹窗

## 场景

用户点击 user 消息的 📝 按钮，弹窗显示 SiPer 发给 LLM 的完整提示词（system + history + current user message）。

## 数据流

```
agent.py process_message()
  → _build_context() 构建 messages 列表
  → 返回 result['prompt_context'] = json.dumps(messages)

siper_web.py ws_handler()
  → stream_end 消息中附加 'prompt_context': result.get('prompt_context', '')

core.js ws.onmessage stream_end
  → 找到最近一条 .msg-row.user
  → row.setAttribute('data-prompt-context', d.prompt_context)

page-chat.js showPromptModal(userText, btn)
  → btn.closest('.msg-row').getAttribute('data-prompt-context')
  → JSON.parse 后按 role 分段渲染
```

## agent.py 修改点

`process_message` 成功返回分支中：

```python
import json as _json
return {
    ...
    'prompt_context': _json.dumps(context, ensure_ascii=False, default=str),
}
```

## siper_web.py 修改点

stream_end 消息构建中：

```python
resp = {
    "type": "stream_end",
    ...
    "prompt_context": result.get("prompt_context", ""),
}
```

## core.js 修改点

stream_end 处理中，`_streamCurrentMsgEl = null` 之后：

```javascript
if (d.prompt_context) {
  try {
    const chatEl = document.getElementById('chatMessages');
    if (chatEl) {
      const rows = chatEl.querySelectorAll('.msg-row.user');
      if (rows.length > 0) {
        const lastUserRow = rows[rows.length - 1];
        lastUserRow.setAttribute('data-prompt-context', d.prompt_context);
      }
    }
  } catch(e) {}
}
```

## 边界情况

- **旧消息（功能上线前发送）**：`data-prompt-context` 属性从未被 setAttribute，`getAttribute` 返回 `null`（不是空字符串）。showPromptModal 中 `if (promptContext)` 对 null 为 false，走 fallback 显示 userText。这是预期行为。
- **AI 未回复时点击**：stream_end 尚未到达，`data-prompt-context` 同样为 null，fallback 显示 userText。
- **tool_calls 消息**：context 中 assistant 消息可能含 `tool_calls` 字段，`_json.dumps` 的 `default=str` 处理。
- **多轮对话**：每轮 AI 回复后，新的 prompt_context 会覆盖上一个 user 消息的 data 属性。
- **验证技巧**：浏览器控制台 `btn.click()` 手动触发，`typeof showPromptModal` 确认函数存在，`row.getAttribute('data-prompt-context')` 检查属性值。
