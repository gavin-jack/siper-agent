# Hermes 空消息处理架构

> 调查日期：2026-07-21
> 涉及组件：hermes-agent (Python) + hermes-web-ui (React/TS)

## 结论

**Hermes 遇到空消息不会显示"空消息"或报错，而是静默发送到 LLM，行为取决于模型和适配器。**

## 各层行为

### 1. Web UI (ChatPage.tsx) — 无检查

- ChatPage 是 **xterm.js 终端嵌入**（PTY WebSocket），不是传统聊天输入框
- 用户按 Enter → 原始字节写入 PTY（`web_server.py:3361` `bridge.write(raw)`）
- **零内容检查**，空字符串直接传给 TUI

### 2. TUI 前端 (ui-tui) — 无检查

- `createGatewayEventHandler.ts:684-703` 处理 `message.complete` 事件
- `turnController.ts:494-496`：`if (finalText)` 才渲染 assistant 气泡
- slash 命令有空消息检查（`createSlashHandler.ts:120`），但普通输入不受保护

### 3. Agent (run_agent.py) — 无检查

- `run_conversation()` 第 12348 行直接添加用户消息，无空值校验
- 空消息原样加入 `messages` 列表并发送给 LLM

### 4. 适配器层 — 仅 Anthropic 有保护

**Anthropic 适配器** (`agent/anthropic_adapter.py:1632-1647`)：
```python
if not content or (isinstance(content, str) and not content.strip()):
    content = "(empty message)"
```
空内容被替换为 `"(empty message)"` 占位符。

**其他适配器（OpenAI、Bedrock、Gemini 等）**：无检查，空字符串原样发送。

### 5. 空响应重试逻辑 (`run_agent.py:15561-15662`)

当 LLM 返回空响应时：
- 最多重试 **3 次**（`_empty_content_retries < 3`）
- 重试耗尽后尝试 **fallback provider**（如已配置）
- 全部失败后返回 `"(empty)"` 字符串 + `_empty_terminal_sentinel: True` 标记
- 状态消息：`"⚠️ Empty response from model — retrying (N/3)"`

### 6. TUI 网关 (`tui_gateway/server.py`)

- 第 3309-3313 行：`"(empty)"` sentinel 处理保持在独立通道
- 第 4685-4686 行：`/retry` 命令检查上一条用户消息是否为空：
  ```python
  if not content:
      return _err(rid, 4018, "last user message is empty")
  ```

## 消息流路径

```
用户输入空消息
  → Web UI (xterm.js → WebSocket → PTY)  [无检查]
    → TUI (Ink/React)  [无检查]
      → tui_gateway (JSON-RPC)  [无检查]
        → AIAgent.run_conversation()  [无检查]
          → 适配器.convert_content_to_anthropic()
            → Anthropic: 替换为 "(empty message)"  ✓ 唯一保护
            → 其他: 原样发送
          → LLM API 调用
            → 空响应 → 3次重试 → fallback → "(empty)"
            → 错误响应 → 错误消息返回
          → TUI 渲染 "(empty)" 或错误消息
```

## 关键文件

| 文件 | 行号 | 作用 |
|---|---|---|
| `hermes-agent/web/src/pages/ChatPage.tsx` | 全部 | 终端嵌入，无输入检查 |
| `hermes-agent/ui-tui/src/app/createGatewayEventHandler.ts` | 684-703 | message.complete 处理 |
| `hermes-agent/ui-tui/src/app/turnController.ts` | 431-522 | 消息完成渲染逻辑 |
| `hermes-agent/ui-tui/src/app/createSlashHandler.ts` | 116-121 | slash 命令空消息检查 |
| `hermes-agent/run_agent.py` | 12348 | 用户消息添加（无检查） |
| `hermes-agent/run_agent.py` | 15561-15662 | 空响应重试逻辑 |
| `hermes-agent/agent/anthropic_adapter.py` | 1632-1647 | Anthropic 空消息占位 |
| `hermes-agent/tui_gateway/server.py` | 3296-3329 | 响应渲染与 sentinel |
| `hermes-agent/tui_gateway/server.py` | 4660-4692 | /retry 空消息检查 |
| `hermes-agent/hermes_cli/web_server.py` | 3263-3370 | PTY WebSocket 网关 |

## 改进建议

如需统一空消息处理：
1. **前端**：在 PTY 写入前检查输入是否为空（`web_server.py:3350` 的 `if not raw: continue` 已跳过空字节，但 Enter 键发送 `\r` 不为空）
2. **Agent**：在 `run_conversation()` 入口处添加空消息检查，返回友好错误
3. **适配器**：在所有适配器中添加与 Anthropic 相同的空消息占位逻辑
