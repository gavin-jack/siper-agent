# SenseNova tool_choice 不兼容修复（v0.6.24）

## 现象
选择商汤日日新（SenseNova）模型后，发送消息报错：
```
[LLM API 错误：HTTP 400] {"error":{"message":"invalid tool_call type","type":"invalid_request_error","code":"3"}}
```

## 根因
`llm_client.py` 的 `chat_completion` 和 `chat_completion_stream` 方法中，当传入 `tools` 时总是同时发送 `tool_choice: "auto"`：
```python
if tools:
    payload["tools"] = tools
    payload["tool_choice"] = "auto"  # SenseNova 不支持此参数
```

SenseNova API 不认识 `tool_choice` 参数，返回 HTTP 400 `invalid tool_call type`。

## 修复
当 base_url 包含 `sensenova` 时，只传 `tools` 不传 `tool_choice`：
```python
if tools:
    payload["tools"] = tools
    if "sensenova" not in self.base_url:
        payload["tool_choice"] = "auto"
```

**两处都需要改**：`chat_completion` 和 `chat_completion_stream` 方法。

## 影响
- SiPer 的工具执行是 agent 层自己模拟的，不依赖 LLM 原生 function calling
- 不传 `tool_choice` 对 LongCat/OpenAI 也不影响（API 默认行为就是 auto）
- SenseNova 不再报 400 错误

## 诊断流程
1. 确认错误是 HTTP 400（不是 401/429/5xx）
2. 确认错误消息包含 `invalid tool_call type`
3. 确认 base_url 是 sensenova
4. 检查 llm_client.py 中是否对 sensenova 跳过了 tool_choice
