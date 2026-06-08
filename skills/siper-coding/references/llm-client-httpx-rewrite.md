# llm_client.py httpx 重写指南

## 背景

Android Chaquopy 无法使用 `openai` SDK（依赖 `jiter`，需要 Rust 编译）。
必须用 `httpx` 重写 `llm_client.py`。

## 需要保持的 API

```python
class LLMClient:
    def __init__(self, api_key, base_url, model, timeout=120, max_retries=3, max_tokens=8192)
    def chat_completion(self, messages, tools=None, temperature=0.7, max_tokens=0) -> Dict
    def chat_completion_stream(self, messages, tools=None, temperature=0.7, max_tokens=0) -> Generator
    def close(self)
```

## 返回格式

```python
# chat_completion 返回
{
    "content": str,
    "tool_calls": [{"id": str, "name": str, "parameters": dict}] | None,
    "usage": {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int},
    "finish_reason": str,
}

# chat_completion_stream yield
{
    "delta": str,
    "finish_reason": str | None,
    "tool_calls": [{"id": str, "name": str, "parameters": dict}] | None,
    "usage": dict | None,
}
```

## httpx 实现要点

1. 使用 `httpx.Client` 保持连接池
2. 非流式：`POST /chat/completions`，解析 JSON
3. 流式：`client.stream("POST", ...)`，逐行解析 SSE
4. 错误处理：429 限流重试、超时重试、连接错误重试
5. tool_calls 累积：流式模式下需跨 chunk 累积

## pip 依赖

```
httpx
```

不需要 `openai`、`jiter`、`distro`、`sniffio` 等。

## 验证

```python
from ai_agent.core.llm_client import LLMClient
c = LLMClient(api_key="test", base_url="https://api.openai.com/v1", model="gpt-4")
r = c.chat_completion([{"role": "user", "content": "hello"}])
assert "content" in r
assert "tool_calls" in r
assert "usage" in r
```
