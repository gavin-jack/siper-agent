# OpenAI SDK 迁移参考

> 2026-05-17 完成迁移。本文档记录迁移细节和回滚方案。

## 迁移概要

| 项目 | 迁移前 (urllib) | 迁移后 (OpenAI SDK) |
|------|-----------------|-------------------|
| HTTP 客户端 | `urllib.request.urlopen` | `openai.OpenAI` + httpx |
| 超时 | 60s | 120s |
| 重试 | 手写循环 (max_retries=3) | SDK 内置 (max_retries=3) |
| 流式 SSE | 手动解析 `data:` 行 | SDK 原生 `stream=True` |
| 错误分类 | `HTTPError`/`URLError`/`TimeoutError` | `RateLimitError`/`APITimeoutError`/`APIConnectionError`/`APIError` |
| 连接池 | 每次新建 | SDK 内置连接池 |
| TCP Keepalive | 无 | 底层 httpx 支持（当前未注入自定义） |

## 文件变更

### `ai_agent/core/llm_client.py` — 完全重写
- 新增 `from openai import OpenAI`（模块顶部）
- `LLMClient.__init__` 创建 `self.client = OpenAI(api_key, base_url, timeout=120, max_retries=3)`
- `chat_completion()` → `self.client.chat.completions.create(**payload)`
- `chat_completion_stream()` → `self.client.chat.completions.create(**payload, stream=True)` + for chunk in stream
- `_parse_response(message)` 解析 SDK 返回的 message 对象（用 `getattr` 取属性）
- 错误处理：捕获 SDK 异常类而非 urllib 异常

### `ai_agent/core/agent.py` — 1 行改动
- `_handle_tool_calls` 的 follow-up `_llm_call` 调用传入 `stream_callback=stream_callback`

### `siper_web.py` — 3 处改动
1. `stream_callback=None` → `_send_stream_delta`（WS 推送 delta 到前端）
2. WS 心跳超时 60s → 300s
3. 响应发送：流式用 `stream_end`，非流式用 `response`

### `webui/static/pages/core.js` — 新增流式处理
- `stream_delta` 消息处理：创建 agent 消息气泡，逐 token 追加
- `stream_end` 消息处理：结束流式，重置 UI 状态

## 运行环境要求

- **必须** 用 `/home/gavin/.hermes/hermes-agent/venv/bin/python3` 启动 SiPer
- 该 venv 已安装 `openai==2.24.0`
- 系统 python3 (`/usr/bin/python3`) **没有** openai SDK，不能用

## 回滚方案

如果 OpenAI SDK 导致问题，回滚步骤：
1. 从 git 历史恢复旧 `llm_client.py`（urllib 版本）
2. 恢复 `agent.py` 中 follow-up 调用的 `stream_callback=None`
3. 恢复 `siper_web.py` 中 `stream_callback=None` 和 WS 心跳 60s
4. 重启 SiPer

## 已知限制

- SDK 默认 http_client 没有 TCP keepalive 注入，WSL2 静默断连风险仍存在
- SDK 的 `timeout` 参数控制整个请求超时（包括所有重试），不是单次尝试超时
- 流式模式下如果 API 返回空 SSE 流（chunk_count=0），agent 会降级到非流式重试
