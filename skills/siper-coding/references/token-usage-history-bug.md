# Token Usage History — 统计为空 Bug 修复（v0.9.52）

## 问题现象

Token 统计页面（`/api/token`）始终显示 0——total_requests=0, total_tokens=0, history=[]。

## 根因

`siper_web.py` 第 56 行初始化了 `_token_usage_history = []`，但**从未有任何代码往里面写入数据**。`api_get_token_stats()` 读取这个列表返回统计，所以永远为空。

## 修复位置

在 `_process_web_message()` 中，`task_record["status"] = "done"` 之后、发送响应之前：

```python
# Record token usage to global history
if result.get("usage"):
    u = result["usage"]
    _token_usage_history.append({
        "time": time.strftime("%H:%M:%S"),
        "model": result.get("model", ""),
        "prompt_tokens": u.get("prompt_tokens", 0),
        "completion_tokens": u.get("completion_tokens", 0),
        "total_tokens": u.get("total_tokens", 0),
    })
    # Keep max 500 entries
    if len(_token_usage_history) > 500:
        _token_usage_history.pop(0)
```

## 诊断方法

1. `curl -s http://127.0.0.1:9724/api/token | python3 -m json.tool`
2. 检查 `total_requests` 和 `history` 长度
3. 如果始终为 0，检查 `_token_usage_history` 是否有 append 调用

## 注意事项

- `_token_usage_history` 是进程内内存列表，服务重启后清空
- 保留最近 500 条，防止内存无限增长
- `result["usage"]` 来自 LLM API 返回，始终存在（即使值为 0）
