# 关闭流式回复

## 方法

将 `siper_web.py` 中 `agent.process_message()` 调用的 `stream_callback` 改为 `None`：

```python
result = await agent.process_message(
    message=effective_text,
    user_id="web_user",
    session_id=session_id,
    stream_callback=None,  # 关闭流式，走非流式 response 消息
    tool_call_callback=_send_tool_progress,
    model=selected_model,
)
```

关闭后：
- LLM 走非流式 `chat_completion`，返回完整 response
- 后端只发 `response` 消息（不含 `stream_start`/`stream_chunk`/`stream_end`）
- `tool_progress` 仍然独立气泡显示（不受影响）
- 前端 `response` 处理逻辑不变

## 注意

- 不要删除 `_send_stream_chunk` 函数，它仍然在模块内被其他地方引用（如异常分支）
- 不要修改 llm_client.py，只改调用端
- `streamBubble` 和 `streamBody` 变量在 `connectWS` 开头声明，关闭流式后不再使用，但留着不影响功能（只是死代码）
- 如果之前有多气泡相关改动（处理 `stream_start`/`stream_chunk`/`stream_end`），关闭流式后这些分支也不会再执行

## 版本
- v0.6.23: 用户要求临时关闭流式回复
