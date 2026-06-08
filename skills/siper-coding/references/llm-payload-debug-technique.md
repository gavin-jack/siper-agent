# LLM Payload 调试技巧

## 场景
当 LLM API 返回 "Expecting value: line 1 column 1 (char 0)" 或其他解析错误时，需要查看实际发送给 API 的消息结构。

## 方法：临时 payload 捕获

在 `llm_client.py` 的 `_build_payload` 方法返回前添加临时调试代码：

```python
# DEBUG: log payload to file (remove after debugging)
try:
    import json as _json
    _dbg_path = "/tmp/llm_payload_latest.json"
    with open(_dbg_path, "w") as _f:
        _f.write(_json.dumps(payload, ensure_ascii=False, indent=2, default=str))
except Exception:
    pass
return payload
```

重启服务后，每次 LLM 调用都会把完整 payload（包含 model、messages、tools）写到 `/tmp/llm_payload_latest.json`。

## 分析要点

检查 payload 中的 messages 数组：
1. **用户消息是否重复**：连续出现两个相同 role=user 的消息
2. **assistant 消息是否同时有 content 和 tool_calls**：LongCat API 不兼容此格式
3. **tool 消息是否有 tool_call_id**：必须有，否则 API 报错
4. **消息顺序是否正确**：tool 消息必须紧跟在对应的 assistant tool_calls 消息之后

## 用 curl 直接复现问题

将 payload 保存为文件后用 curl 直接测试 API：

```python
import urllib.request, json

payload = json.dumps({
    "model": "LongCat-2.0-Preview",
    "messages": [...],  # 从 /tmp/llm_payload_latest.json 复制
    "max_tokens": 200,
}).encode()

req = urllib.request.Request(
    "https://api.longcat.chat/openai/chat/completions",
    data=payload,
    headers={"Content-Type": "application/json", "Authorization": "Bearer YOUR_KEY"},
    method="POST",
)
resp = urllib.request.urlopen(req, timeout=30)
print(resp.read().decode())
```

如果返回空 body 或 JSONDecodeError，说明消息结构有问题。逐个移除消息排查哪条消息导致问题。

## 调试完成后

务必移除 `_build_payload` 中的调试代码，避免每次调用都写文件影响性能。
