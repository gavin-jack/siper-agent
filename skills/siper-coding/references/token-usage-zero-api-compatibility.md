# Token Usage 为 0 的 API 兼容性问题

## 问题描述

某些 LLM API（如 SenseNova）在流式响应的 chunk 中不返回 `usage` 字段，导致前端 token 统计显示 `⬆️ 0 · ⬇️ 0`。

## 技术细节

`llm_client.py` 中流式响应的 usage 提取：
```python
usage_obj = getattr(chunk, "usage", None)
if usage_obj:
    usage_dict = {
        "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0),
        "completion_tokens": getattr(usage_obj, "completion_tokens", 0),
        "total_tokens": getattr(usage_obj, "total_tokens", 0),
    }
```

如果 API 不在 chunk 中返回 `usage`，`usage_dict` 为 None，最终 `collected_usage` 保持为初始值 `{}`。

## 影响

- 前端 `meta.usage` 为 `{}`，`showTokens` 为 true 但 token 数显示为 0
- 这不是代码 bug，是 API 提供商的行为差异

## 已知不返回 streaming usage 的 API

- SenseNova (`https://token.sensenova.cn/v1`) — streaming chunk 中无 usage
- 某些免费代理 API（如 `https://api.apifree.ai/agent/v1`）— 可能不返回 usage

## 诊断方法

1. 浏览器发消息后检查 meta 中 token 数
2. 如果为 0，检查后端日志中是否有 `token 用量=` 输出
3. 如果后端日志也无 usage，确认是 API 限制

## 可能的修复方向

1. 在非流式响应中补充 usage（某些 API 只在完整响应中返回）
2. 前端显示 "N/A" 而非 "0" 以区分"无数据"和"真的为 0"
3. 后端在 stream_end 时从最后一个 chunk 或完整响应中补充 usage
