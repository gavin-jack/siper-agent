# 流式 LLM 请求空响应修复模式

**状态：已过时（v0.5.3/v0.5.6）** — 被 `llm-empty-content-valid-sse.md` 中的 agent.py 层检测替代。保留作为历史参考。

## 问题现象
前端收到 stream_start 后收到 stream_end，content 为空字符串，显示空消息气泡。用户看到的错误消息：`[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]`。

## 根因
`chat_completion_stream` 中 SSE 流处理没有空响应检测：
- LongCat API 间歇性返回 HTTP 200 但 SSE body 为空或无有效 `data:` 行（高负载时限流的一种表现）
- `for raw_line in resp` 直接结束，不报错
- `collected_content` 为空列表，`content = ""`
- 流式结束 chunk yield `{"delta": "", "finish_reason": "stop"}`
- agent.py 认为 `success=True`，siper_web.py 发送空 stream_end

**注意**：这不是 HTTP 429，而是 API 返回了 200 但没给内容。429 会被 urllib 抛出 HTTPError，走另一个重试分支。空响应和 429 是两种不同的限流表现。

**对比 hermes**：hermes 用 OpenAI SDK，SDK 内置 SSE 解析，不会出现此问题。siper 用 raw urllib，需要手动处理。

## 修复代码模式

### v0.5.3 初始修复（has_content 标记）

在流式请求的 attempt 循环内增加 has_content 标记：

```python
has_content = False  # 标记是否收到过有效内容

for raw_line in resp:
    ...
    if delta_content:
        has_content = True
    tc_list = delta.get("tool_calls")
    if tc_list:
        has_content = True
    ...

# SSE 流结束后：空响应检测
if not has_content and not acc_tool_calls:
    if attempt < max_retries:
        self.logger.warning(f"LLM 流式请求返回空响应，{retry_delay}秒后重试（{attempt}/{max_retries}）")
        time.sleep(retry_delay)
        retry_delay *= 2
        continue
    else:
        self.logger.error(f"LLM 流式请求连续 {max_retries} 次返回空响应")
        yield {"delta": "[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]",
               "finish_reason": "error", "tool_calls": None, "usage": None}
        return
```

### v0.5.6 改进（chunk_count + received_done）

**问题**：has_content 逻辑有缺陷——API 返回了 `[DONE]` 标记但所有 chunk 的 `content` 都是空字符串（如只有 role 的初始 chunk），has_content 仍为 False，误判为空响应。

**改进**：改用 `chunk_count == 0 && !received_done && !finish_reason` 判断：

```python
received_done = False  # 是否收到 [DONE] 标记
chunk_count = 0       # 收到的有效 JSON chunk 数

for raw_line in resp:
    line = raw_line.decode("utf-8", errors="replace").strip()
    if not line:
        continue
    if line.startswith("data:"):
        payload_str = line[5:].strip()
        if payload_str == "[DONE]":
            received_done = True
            break
        try:
            chunk_data = json.loads(payload_str)
        except json.JSONDecodeError:
            continue

        chunk_count += 1
        # ... process chunk ...

# 空响应检测：连接成功但 SSE 流中无任何有效 JSON chunk
if chunk_count == 0 and not received_done and not finish_reason:
    if attempt < max_retries:
        self.logger.warning(f"LLM 流式请求返回空响应，{retry_delay}秒后重试（{attempt}/{max_retries}）")
        time.sleep(retry_delay)
        retry_delay *= 2
        continue
    else:
        self.logger.error(f"LLM 流式请求连续 {max_retries} 次返回空响应")
        yield {"delta": "[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]",
               "finish_reason": "error", "tool_calls": None, "usage": None}
        return
```

**关键区别**：
- 旧逻辑：API 返回了 `[DONE]` 但所有 chunk content 为空 → 误判为空响应 → 重试 3 次后报错
- 新逻辑：只要收到 `[DONE]` 或 `finish_reason` 或任意有效 chunk，就认为流正常，不触发重试

**退避参数**：初始 `retry_delay = 5`（不是 2），指数退避 5→10→20s。空响应通常是 API 限流或高负载的表现，需要较长等待。

## 关联修复

agent.py process_message 中增加 `finish_reason == 'error'` 的检查：

```python
if llm_response.get('finish_reason') == 'error':
    self.logger.warning(f"LLM 返回错误 finish_reason，response_content={response_content[:100]!r}")
```

## 排查方法
1. 后端日志搜索 `LLM 流式请求返回空响应`
2. 如果看到 `连续 3 次返回空响应`，说明 API 持续异常
3. 检查 `finish_reason=error` 日志确认 agent 层收到了错误