# 流式消息截断：fire-and-forget future 导致消息丢失

## 现象

用户报告智能体回复只显示前半段，后半段丢失。例如回复两段话，气泡只显示第一段。

## 根因

`agent.py` 的 `_stream_collector` 中，`asyncio.run_coroutine_threadsafe` 把 `stream_callback(delta)` 抛到事件循环后不等待（fire-and-forget）：

```python
future = asyncio.run_coroutine_threadsafe(stream_callback(delta), loop)
# Don't wait for callback to avoid blocking stream
```

`stream_callback` 即 siper_web.py 的 `_send_stream_chunk`，内部有 `await ws.send(...)`。

当 LLM 回复较长时，大量 chunk 的发送任务堆积在事件循环队列中。`_stream_collector` 跑完后，`process_message` 立即返回，siper_web.py 发送 `stream_end`，前端关闭消息气泡（`_streamCurrentMsgEl = null`），后续到达的 chunk 被丢弃。

## 时序

1. `_stream_collector` 在 executor 线程中迭代 LLM 流式响应
2. 每个 chunk 通过 `run_coroutine_threadsafe` 调度 `ws.send`，但不等待
3. `_stream_collector` 完成 → `process_message` 返回
4. siper_web.py 发 `stream_end` → 前端 `_streamCurrentMsgEl = null`
5. 事件循环中排队的 `ws.send` 继续执行 → 但前端已忽略 chunk

## 修复

收集所有 pending future，在 `_stream_collector` 完成后等待它们全部完成：

```python
pending_futures = []

def _stream_collector():
    nonlocal collected_content, collected_tool_calls, collected_usage, collected_finish, pending_futures
    for chunk in self.llm_client.chat_completion_stream(...):
        delta = chunk.get("delta", "")
        if delta:
            collected_content.append(delta)
            future = asyncio.run_coroutine_threadsafe(stream_callback(delta), loop)
            pending_futures.append(future)
        # ... rest of chunk processing

await asyncio.wait_for(loop.run_in_executor(None, _stream_collector), timeout=120)

# Wait for all pending stream sends to complete
for f in pending_futures:
    try:
        f.result(timeout=5)
    except Exception:
        pass
```

关键点：
- `pending_futures` 在外层定义，通过 `nonlocal` 在 `_stream_collector` 中追加
- collector 完成后逐个等待 future，每个最多 5s
- 超时或异常不阻塞（`except pass`），避免单个发送失败影响整体

## 相关文件

- `ai_agent/core/agent.py` — `_stream_collector` 方法
- `siper_web.py` — `_send_stream_chunk` callback

## 关联陷阱

- `references/streaming-empty-response-fix.md` — 流式空响应（不同的问题）
- `references/llm-retry-pattern.md` — LLM 重试策略
- `references/llm-error-display-pattern.md` — 流式错误显示
