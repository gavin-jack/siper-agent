# siper_web.py try/except result 变量作用域陷阱

## 问题描述

`siper_web.py` WS handler 中，`result` 变量在 try 和 except 分支中被分别赋值，但两个分支的 dict 结构不一致：

**try 分支（第 1850-1856 行）：**
```python
result = await agent.process_message(...)
# result 包含: response, session_id, tool_calls_executed, tool_call_steps,
#              processing_time_ms, success, usage, prompt_context
```

**except 分支（第 1866 行）：**
```python
result = {"success": False, "tool_calls_executed": 0, "tool_call_steps": [], "processing_time_ms": 0}
# 缺少: "response", "usage", "prompt_context" 等 key
```

## 影响

1. 第 1882 行 `usage = result.get("usage", {})` — except 分支中取不到 `"usage"`，回退到 `{}`。不会崩溃但不一致。
2. 第 1921 行 `"content": response` — `response` 变量在第 1864 行单独赋值 `f"Error: {e}"`，不依赖 result。所以这里没问题。
3. 如果后续代码新增对 `result["response"]` 的访问，except 分支会报 `KeyError`。

## 修复建议

except 分支的 result 应包含所有必要 key：
```python
result = {
    "success": False,
    "response": f"Error: {e}",
    "usage": {},
    "tool_calls_executed": 0,
    "tool_call_steps": [],
    "processing_time_ms": 0,
}
```

或者统一从局部变量取（`response` 和 `usage` 已在 except 分支中单独赋值），不依赖 result dict。

## 发现时间

v0.6.9 (2026-05-16) 排查 LLM 返回消息链路时发现。当前不会触发崩溃，属于潜在风险。
