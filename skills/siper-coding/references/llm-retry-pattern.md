# LLM 重试模式参考

> **2026-07-21 更新**: 修复 `_stream_inner` 中 `raise RuntimeError("empty_stream")` 穿透 generator 边界导致重试循环失效的 bug。改为 `yield {"finish_reason": "empty_stream"}` + `return`，外层重试循环通过检测该 finish_reason 触发重试。详见"空流检测的 generator 陷阱"一节。

## 架构变更历史

| 时期 | HTTP 客户端 | 超时 | 重试 | 流式 |
|------|------------|------|------|------|
| v0.6.x 及之前 | raw urllib | 60s | 手写 retry 循环 (max_retries=3) | urllib + 手动 SSE 解析 |
| v0.7.0+ (2026-05-17) | OpenAI SDK (`openai.OpenAI`) | 120s | SDK 内置 (`max_retries=3`) | SDK 原生 `stream=True` |
| v0.7.2+ (2026-07-19) | OpenAI SDK + 手动重试 | 120s | SDK 内置 + 手动 3 次重试 | SDK 原生 + 手动重试 |

## OpenAI SDK 客户端配置

```python
from openai import OpenAI

client = OpenAI(
    api_key=api_key,
    base_url=base_url,      # e.g. "https://api.longcat.chat/openai"
    timeout=120,            # 请求超时 120s（之前 urllib 60s）
    max_retries=3,          # SDK 内置自动重试（429/5xx）
)
```

## 重试策略（双层）

### 第一层：SDK 内置重试
- 覆盖：429 RateLimitError、5xx APIError、网络连接错误
- 指数退避，最多 `max_retries=3` 次
- **对 JSONDecodeError / 空 body 无效**（SDK 只管网络层）

### 第二层：手动重试循环（v0.7.2 新增）
- 覆盖：JSONDecodeError、Expecting value、空响应（0 chunk）、APIConnectionError
- 3 次尝试，间隔 1s/2s/4s（`delay = 2 ** (attempt - 1)`）

## 当前实现

### 非流式 (`chat_completion`)

```python
last_error = None
for attempt in range(3):
    if attempt > 0:
        delay = 2 ** (attempt - 1)
        time.sleep(delay)
    try:
        response = self.client.chat.completions.create(**payload)
        # ... parse and return ...
    except RateLimitError as e:
        # ⚠️ v0.9.15+: RateLimitError 也走指数退避重试，不再立即返回错误
        last_error = e
        if attempt < 2:
            delay = 2 ** attempt  # 1s/2s
            self.logger.info(f"限流退避等待 {delay}s...")
            time.sleep(delay)
            continue
        return {"content": "[LLM API 错误：请求过于频繁，请稍后重试]", ...}
    except APITimeoutError as e:
        last_error = e
        continue
    except APIConnectionError as e:
        last_error = e
        continue
    except APIError as e:
        return {"content": f"[LLM API 错误：HTTP {e.status_code}] {str(e.message)[:200]}", ...}
    except Exception as e:
        err_msg = str(e)
        if "JSONDecodeError" in type(e).__name__ or "Expecting value" in err_msg:
            last_error = e
            continue
        return {"content": f"[LLM API 错误：请求异常] {e}", ...}
# All retries exhausted
return {"content": f"[LLM API 错误：请求异常] {last_error}", ...}
```

### 流式 (`chat_completion_stream`) — _stream_inner 提取模式

```python
def _stream_inner(self, payload: Dict):
    """单次流式尝试的 generator。
    空流时 yield {"finish_reason": "empty_stream"} + return（不 raise）。
    RateLimitError / 连接错误时 raise，让外层重试循环处理。
    其他 API 错误时 yield {"finish_reason": "error"}，外层不重试。
    """
    try:
        stream = self.client.chat.completions.create(**payload)
    except RateLimitError as e:
        raise  # ⚠️ v0.9.15+: 改为 raise，让外层重试循环处理
    except APIConnectionError as e:
        raise  # 让外层重试循环处理
    except APIError as e:
        yield {"delta": f"[LLM API 错误：HTTP {e.status_code}]", "finish_reason": "error", ...}
        return
    except Exception as e:
        err_msg = str(e)
        if "JSONDecodeError" in type(e).__name__ or "Expecting value" in err_msg:
            raise  # 让外层重试循环处理空 body
        yield {"delta": f"[LLM API 错误：流式请求异常] {e}", "finish_reason": "error", ...}
        return

    # ... 正常 chunk 处理，累加 tool_calls ...

    if chunk_count == 0:
        self.logger.warning("LLM 流式请求返回空响应（0 个 chunk）")
        yield {"delta": "", "finish_reason": "empty_stream", "tool_calls": None, "usage": None}
        return

def chat_completion_stream(self, messages, tools=None, ...):
    payload = self._build_payload(messages, tools, ...)
    payload["stream"] = True

    for attempt in range(3):
        if attempt > 0:
            delay = 2 ** (attempt - 1)
            time.sleep(delay)

        had_delta = False
        error_yielded = False
        empty_stream = False
        try:
            for item in self._stream_inner(payload):
                if item.get("finish_reason") == "error":
                    error_yielded = True
                if item.get("finish_reason") == "empty_stream":
                    empty_stream = True
                if item.get("delta"):
                    had_delta = True
                yield item
        except (RateLimitError, APIConnectionError) as e:
            # ⚠️ v0.9.15+: 捕获 RateLimitError 和 APIConnectionError 触发重试
            last_error = e
            self.logger.warning(f"流式请求第 {attempt+1}/3 次尝试异常：{type(e).__name__}，准备重试...")
            continue
        except Exception as e:
            self.logger.error(f"流式请求不可恢复异常：{e}")
            yield {"delta": f"[LLM API 错误：{e}]", "finish_reason": "error", ...}
            return

        if had_delta and not error_yielded:
            return  # 成功
        if error_yielded:
            return  # API错误，不重试
        if empty_stream:
            continue  # 空流 → 重试
```

## 错误处理分类

| 错误类型 | 处理方式 |
|---------|---------|
| 限流 (429) | **v0.9.15+: 指数退避重试 3 次（1s/2s/4s），全部失败后返回错误消息** |
| 超时 | 手动重试循环，3 次，间隔 1s/2s/4s |
| 连接失败 | 手动重试循环，3 次 |
| API 错误 (5xx) | 直接返回错误消息，不重试 |
| JSONDecodeError / Expecting value | 手动重试循环，3 次 |
| 空响应 (0 chunk) | 手动重试循环，3 次 |

## 注意事项

- SiPer 必须用 hermes venv 启动：`/home/gavin/.hermes/hermes-agent/venv/bin/python3`
- SDK 的 `timeout` 控制整个请求超时（含重试），非单次尝试超时
- `_parse_response` 用 `getattr` 取 SDK 返回的 message 对象属性，不用 dict 下标
- **f-string 陷阱**: `f"...{expr}:text"` 中 `}` 后紧跟 `:` 可能导致 SyntaxError。检查 f-string 中的字面量括号是否正确转义（`}` → `}}`）
- **流式重试模式**: generator 方法必须拆分为 `_stream_inner()` + 外层 for 循环。不能直接在 generator 内 `continue` 外层 for 循环
- **判断重试条件**: 外层循环通过 `had_delta` 和 `error_yielded` 两个标志判断是否需要重试。若已有 delta 且无 error 则成功；若有 error 则不重试（限流等）；若两者都无则重试（空流/断连）
