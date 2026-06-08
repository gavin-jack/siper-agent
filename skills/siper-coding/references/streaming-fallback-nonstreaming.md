# 流式失败降级到非流式 API + follow-up 传递 stream_callback

**状态：待实施（v0.6.6）**

## 问题

两个独立问题导致 Siper 流式回复不工作：

1. **流式空响应**：LLM API 返回空 SSE 流（HTTP 200 但无 data: 行），stream_callback 从未被调用，stream_started=False，走非流式路径
2. **follow-up 无流式**：_handle_tool_calls 的 follow-up _llm_call 没有传 stream_callback，工具调用后的回复走非流式路径

## 修复1：流式失败时降级到非流式 API

agent.py _llm_call 流式分支，当检测到空 content 时，不直接返回错误文本，而是降级到非流式 chat_completion()：

```python
content = "".join(collected_content)
if not content.strip() and not collected_tool_calls:
    if attempt < max_attempts:
        self.logger.warning("LLM 流式返回空 content，降级到非流式重试...")
        result_raw = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.llm_client.chat_completion(
                    messages=messages, tools=tools_payload
                ),
            ),
            timeout=120,
        )
        result = {
            'content': result_raw.get('content', ''),
            'tool_calls': result_raw.get('tool_calls'),
            'usage': result_raw.get('usage', {}),
            'finish_reason': result_raw.get('finish_reason', 'stop'),
        }
        break  # 非流式结果直接跳出重试循环
    else:
        self.logger.error("LLM 流式+非流式均返回空 content，重试耗尽")
        content = "[服务暂时没有响应，请重试]"
        collected_finish = 'error'
```

## 修复2：follow-up 传递 stream_callback

三处修改：

**1. _handle_tool_calls 函数签名增加 stream_callback=None**

**2. process_message 调用时传入 stream_callback=stream_callback**

**3. follow-up _llm_call 传入 stream_callback=stream_callback**

## agent.py 第 993 行死代码（v0.6.9 发现）

流式分支中，第 969-990 行检测到空 content 后降级到非流式调用，然后 `break` 跳出 `for attempt` 循环。

但第 993-999 行又有一个**完全相同的空 content 检测**：
```python
# 第 993 行 — 永远不会执行到
if not content.strip() and not collected_tool_calls:
    if attempt < max_attempts:
        self.logger.warning(f"LLM 流式返回空 content，重试（第 {attempt}/{max_attempts} 次）...")
        continue
    self.logger.error("LLM 流式返回空 content，已重试耗尽")
    content = "[服务暂时没有响应，请重试]"
    collected_finish = 'error'
```

这段代码是死代码，因为：
- 第 969 行的条件与第 993 行完全相同
- 第 969 行处理后会 `break` 或 `continue`，不会 fall through 到第 993 行
- 如果走 `break`，直接跳出循环；如果走 `continue`，回到 for 循环顶部

**建议**：删除第 993-999 行（或保留为注释说明已处理），避免未来维护者困惑。

## siper_web.py 异常分支 result dict 缺少 "usage" key（v0.6.9 发现）

siper_web.py 第 1866 行异常分支：
```python
result = {"success": False, "tool_calls_executed": 0, "tool_call_steps": [], "processing_time_ms": 0}
```

此 dict 缺少 `"response"` 和 `"usage"` key。虽然第 1864 行已经单独赋值了 `response = f"Error: {e}"`，第 1865 行赋值了 `usage = {}`，但第 1882 行 `usage = result.get("usage", {})` 会覆盖第 1865 行的值（因为 result 中没有 "usage" key，取到默认值 {}）。

当前行为不会崩溃（因为 response 和 usage 变量已在 try 分支外声明），但逻辑冗余且不一致。建议统一：要么全部从 result 取，要么全部单独赋值，不要混用。

## 完整 LLM 错误处理链路（v0.6.9 验证）

本次排查确认了从 API 空响应到前端显示的完整链路：

```
API 返回空 SSE 流
  → llm_client.chat_completion_stream() 检测到 chunk_count==0
  → 重试 3 次（指数退避 5→10→20s）
  → 耗尽后 yield {"delta": "[LLM API 错误：连续 3 次返回空响应...]", "finish_reason": "error"}
  → agent.py _llm_call 流式分支收集到空 content
  → 第 969 行检测空 content，降级到非流式 chat_completion()
  → 非流式也返回空响应（llm_client 第 92 行返回错误 dict）
  → result = {"content": "[LLM API 错误：...]", "finish_reason": "error", ...}
  → break 跳出 for attempt 循环
  → process_message 第 290 行 response_content = "[LLM API 错误：...]"
  → 第 294 行 is_llm_error = True
  → 返回 {"response": "[LLM API 错误：...]", "success": False, ...}
  → siper_web.py 第 1916 行 is_error = True
  → 第 1921 行 "content": response（= 错误信息）
  → 前端 core.js 第 1465-1482 行应用错误样式并显示错误文本
```

整个链路正确，无需修复。

## Siper vs Hermes 架构差异（根本原因）

| 方面 | Hermes | Siper |
|------|--------|-------|
| SSE 解析 | OpenAI SDK 内置 | raw urllib 手动解析 |
| 空流处理 | SDK 自动处理 | 需手动检测+重试 |
| 多轮工具调用 | while 循环 max_iterations=90 | 一次 _llm_call + 一次 follow-up |
| 流式回调 | SDK 自动调用 | _stream_collector + run_coroutine_threadsafe |

Siper 用 raw urllib 手动解析 SSE，所有边界情况都需要自行处理。这是 Siper 流式问题频发的根本原因。

## 关联参考

- streaming-empty-response-fix.md — 空 SSE 流的检测和重试
- streaming-debug-zero-chunks.md — stream_chunk=0 的排查流程
- streaming-fire-and-forget-truncation.md — 消息截断问题
- llm-empty-content-valid-sse.md — 有效 SSE 但 content 为空
