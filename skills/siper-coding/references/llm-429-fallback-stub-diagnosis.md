# LLM API 429 RateLimitError → Fallback Stub 诊断与修复

## 现象

用户看到 SiPer 回复英文 stub：
```
I received your message: "xxx". I'm ready to help you with my available tools and skills.
```

或中文 stub（修复后）：
```
收到你的消息。抱歉，LLM 服务暂时不可用（可能是 API 额度不足或网络问题），请稍后再试。
```

## 根因链

1. **LongCat API 返回 HTTP 429**（Token 额度不足）
2. `llm_client.chat_completion_stream()` 重试 2 次（`for attempt in range(2)`，注意日志写 "第 {attempt+1}/3 次" 但实际只循环 2 次）
3. 重试后仍失败 → `_stream_collector` 收集到空 content
4. agent.py 降级到非流式 `chat_completion`，也失败
5. `llm_client is None` 或返回空 → 触发 fallback stub

## 诊断步骤

1. **确认 LLM 失败**：查看日志中 `429\|RateLimitError\|llm_client 为 None`
2. **检查 API Key**：`echo $LONGCAT_API_KEY` — 环境变量有值不代表额度充足
3. **检查 models.json**：api_key 字段可能为空（依赖 env var）
4. **测试 API 连通性**：用 Python urllib 直接调 LongCat API，看返回 200 还是 429

## 修复方案

### 短期（fallback 文案）
- 已将 `agent.py:1096` 的英文 stub 改为中文友好提示
- **必须重启 SiPer** 才能让修改生效

### 长期（解决 429）
- 充值 LongCat API 额度：https://longcat.chat/platform/feedback
- 或更换 API Key
- 考虑增加 llm_client 重试次数（当前 `range(2)` 仅 2 次尝试）

## 相关代码位置

- `ai_agent/core/agent.py:1084-1097` — fallback stub
- `ai_agent/core/llm_client.py:354` — `for attempt in range(2)` 重试循环
- `ai_agent/core/llm_client.py:437-440` — RateLimitError 捕获与 continue 重试
