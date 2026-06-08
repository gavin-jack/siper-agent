# 流式回复 result 未赋值导致 NoneType 错误

## 问题描述

`agent.py` `_llm_call` 流式分支中，当流式正常返回了 content（非空）时，代码没有构建 `result` 字典。`result` 变量保持为 `None`（第 910 行初始化），导致上层 `process_message` 中 `llm_response.get('usage', {})` 报 `'NoneType' object has no attribute 'get'`。

## 根因

流式分支代码结构：

```python
result = None  # 第 910 行初始化

for attempt in range(1, max_attempts + 1):
    try:
        if stream_callback:
            # ... 流式收集 ...
            content = "".join(collected_content)

            # 只有空 content 降级路径才设置 result
            if not content.strip() and not collected_tool_calls:
                # ... 降级到非流式 ...
                result = {...}  # 只有这里设置
                break

            # 正常路径：没有设置 result！
            # 循环结束，result 仍然是 None
```

## 修复方案

在 `content = "".join(collected_content)` 之后、空 content 检测之前，先构建 result：

```python
content = "".join(collected_content)
# Build result dict for normal streaming path
result = {
    'content': content,
    'tool_calls': collected_tool_calls,
    'usage': collected_usage,
    'finish_reason': collected_finish,
}
# 空 content 检测：有效 SSE 流但 content 全为空且无 tool_calls
if not content.strip() and not collected_tool_calls:
    # 降级逻辑...
```

## 验证方法

1. 发送一条消息，确认不再报 `'NoneType' object has no attribute 'get'`
2. 检查日志：`agent.siper_agent` 应有 `LLM 调用完成：finish_reason=...` 日志
3. 前端应正常显示流式回复

## 相关

- `references/streaming-fallback-nonstreaming.md` — 流式降级到非流式模式
- `references/streaming-debug-zero-chunks.md` — 流式回复 stream_chunk=0 的排查流程
- `references/llm-empty-content-valid-sse.md` — LLM 返回有效 SSE 流但 content 全为空
