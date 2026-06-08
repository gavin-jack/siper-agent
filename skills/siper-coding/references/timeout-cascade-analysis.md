# SiPer 多层超时级联分析

> **2026-05-17 更新**: SiPer 已迁移到 OpenAI SDK，WS 心跳已改为 300s。本文档已更新。

## "服务暂时没有响应，请重试" 消息溯源

**来源**: `ai_agent/core/agent.py:1030`

```python
result['content'] = "[服务暂时没有响应，请重试]"
result['finish_reason'] = 'error'
```

**触发条件**: LLM API 返回空 content，重试耗尽（max_attempts，默认 2 次）后触发。

## 三层超时架构（当前）

```
┌─────────────────────────────────────────────┐
│  Layer 3: Agent asyncio.wait_for            │  timeout=120s (agent.py:996/1016)
│  ┌─────────────────────────────────────────┐│
│  │  Layer 2: LLM Client (OpenAI SDK)       ││  timeout=120s (llm_client.py)
│  │  ┌─────────────────────────────────────┐││
│  │  │  Layer 1: LongCat API               │││  实际处理时间不定
│  │  │  (排队 + 推理 + 网络传输)            │││
│  │  └─────────────────────────────────────┘││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  WebSocket 心跳超时                          │  timeout=300s (siper_web.py:1776)
│  独立于 LLM 调用层                           │  已从 60s 增加到 300s
└─────────────────────────────────────────────┘
```

## 已完成的修复（2026-05-17）

1. **urllib → OpenAI SDK**: `llm_client.py` 完全重写，使用 `openai.OpenAI` 客户端
   - timeout: 60s → 120s
   - max_retries: 手写循环 → SDK 内置 (max_retries=3)
   - 流式: 手动 SSE 解析 → SDK 原生 `stream=True`
   - 错误处理: 手写分类 → SDK 异常类 (`RateLimitError`, `APITimeoutError`, etc.)

2. **WS 心跳超时**: 60s → 300s (`siper_web.py:1776`)
   - 防止 LLM 长响应期间 WS 断开

3. **流式响应启用**: `siper_web.py` 中 `stream_callback=None` → `_send_stream_delta`
   - 后端逐 token 推送 delta 到前端
   - 前端 core.js 新增 `stream_delta` 和 `stream_end` 消息处理
   - 用户看到实时打字效果

4. **工具调用后也流式**: `agent.py:_handle_tool_calls` 的 follow-up LLM 调用现在传递 `stream_callback`

## 级联失败场景（已缓解）

### 场景 A: LLM 响应慢（>60s）— 已缓解

之前 urllib 60s 超时 → 重试 → WS 也超时。现在：
- SDK timeout=120s，给 LLM 更多时间
- WS 心跳 300s，不会在 LLM 响应期间断开
- 流式响应边生成边推，用户不需要等待完整响应

### 场景 B: WSL2 TCP 静默断开 — 部分缓解

- SDK 底层 httpx 有 TCP keepalive（如果配置了自定义 http_client）
- 但当前 SiPer 使用 SDK 默认 http_client，未注入自定义 keepalive
- 如需进一步增强，可参考 Hermes 的 `_build_keepalive_http_client` 模式

## 当前风险点

- SDK 默认 http_client 没有 TCP keepalive 注入，WSL2 静默断连风险仍存在
- 流式响应如果 API 返回空 SSE 流（chunk_count=0），agent 会降级到非流式重试
- Agent 层仍有 `max_attempts=2` 的重试限制，重试耗尽后仍会返回错误消息

## 相关文档

- `references/llm-retry-pattern.md` — LLM 重试策略（已更新为 SDK 模式）
- `references/ws-heartbeat-fix.md` — WS 心跳修复模式
- `references/streaming-empty-response-fix.md` — 流式空响应修复
