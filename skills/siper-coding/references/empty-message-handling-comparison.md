# 空消息处理架构：SiPer vs Hermes vs Hermes-Web-UI

## 问题

用户发送空消息（空白字符串）或 LLM 返回空响应时，三层代码（前端、后端、网关）如何处理。

## 三层对比

| 层级 | SiPer | Hermes | Hermes-Web-UI |
|------|-------|--------|---------------|
| **前端输入检查** | 无（xterm PTY 直接写入） | 无 | 无 |
| **后端空响应重试** | 3次（可配置 `retry.max_empty_content_retries`） | 3次（硬编码） | N/A |
| **空响应 sentinel** | `"(empty)"` | `"(empty)"` | N/A |
| **网关 sentinel 处理** | `server.py:3309` 检测并转发 | 同左 | N/A |
| **TUI 渲染空消息** | `turnController.recordMessageComplete()` 中 `if (finalText)` 判空 → 丢弃 | 同左 | N/A |
| **前端显示** | xterm 显示 PTY 字节流，空响应 = 无输出 | xterm 显示 PTY 字节流 | xterm 显示 PTY 字节流 |

## 关键代码位置

### 后端（run_agent.py）
- `_empty_content_retries` 初始化：行 12229
- 空响应重试循环：行 15561‑15690
- 重试耗尽后返回 `"(empty)"`

### 适配器（anthropic_adapter.py）
- 行 1632‑1647：空用户消息 → `"(empty message)"` 替换（仅 Anthropic）

### 网关（tui_gateway/server.py）
- 行 3309：`"(empty)"` sentinel 处理
- 行 2074：`if not content_text.strip()` 空内容检测
- 行 4685：branch 命令空消息错误 "last user message is empty"

### TUI 前端（ui-tui）
- `turnController.ts:431-520`：`recordMessageComplete()` 中 `if (finalText)` 丢弃空文本
- `createGatewayEventHandler.ts:680-690`：`message.complete` handler

### SiPer 前端（webui）
- `core.js:1340-1389`：流式聚合渲染（已改为无聚合模式）

## 行为总结

1. **用户发送空消息**：前端不检查，直接发送到后端
2. **LLM 返回空响应**：后端重试 3 次，仍空则返回 `"(empty)"` sentinel
3. **TUI 渲染**：空文本被静默丢弃，用户看不到任何气泡
4. **Web UI (xterm)**：显示 PTY 字节流，空响应 = 无输出，看起来像"卡住"
5. **连续空响应**：每次都会触发完整的重试循环，前端表现为多次"等待"

## 差异点

- SiPer 的重试次数可通过 `config.yaml` 配置，Hermes 硬编码
- 只有 Anthropic 适配器会预处理空用户消息，其他适配器原样发送
- SiPer 前端已从聚合模式改为无聚合模式（每个 delta 独立气泡）
