# 多消息回复架构（v0.9.45）

## 背景

SiPer 前端始终只显示一条 agent 消息气泡（单 bubble 设计）。LLM 调用 `send_message` 工具时，消息只是写到 `data/outbox.json`，前端收不到。

## 新架构：ws_send 回调

### 核心思路

`siper_web.py` 在调用 `agent.process_message()` 时，传入一个 `ws_send` 回调。
LLM 调用 `send_message` 工具时，工具通过 `agent.ws_send()` 直接向前端推送一条 `agent_message` 类型的 WS 消息。
前端 `core.js` 收到 `agent_message` 后，显示为独立的 agent 消息气泡。

### 数据流

```
LLM tool_call(send_message)
  -> send_message_tool.execute()
    -> agent.ws_send({type: "agent_message", data: {content: "..."}})
      -> siper_web.py _ws_send()
        -> ws.send(JSON.stringify(payload))
          -> 前端 core.js onmessage(d.type === "agent_message")
            -> 先结束当前 stream（如有）
            -> addMsg(content, 'agent', meta)
              -> 独立气泡
```

### 修改清单（4 个文件）

#### 1. `ai_agent/core/agent.py`
- `__init__` 添加 `self.ws_send = None` 和 `self.ws_session_id = None`
- `process_message` 新增 `ws_send=None` 参数
- 方法开头设置 `self.ws_send = ws_send; self.ws_session_id = session_id`
- 返回前清理 `self.ws_send = None; self.ws_session_id = None`

#### 2. `ai_agent/tools/send_message_tool.py`
- 优先通过 `agent.ws_send()` 推送消息（如果可用）
- 失败时回退到写 `data/outbox.json`（兼容 CLI 等非 WS 场景）
- description 更新：说明工具会创建独立消息气泡

#### 3. `siper_web.py`
- 新增 `_ws_send(payload)` async 回调函数
- 调用 `agent.process_message()` 时传入 `ws_send=_ws_send`

#### 4. `webui/static/pages/core.js`
- WS onmessage 新增 `agent_message` 类型处理
- 收到时先结束当前 stream（如有），再调用 `addMsg()` 显示独立气泡

### WS 消息格式

```json
{
  "type": "agent_message",
  "session_id": "...",
  "data": {
    "content": "消息内容",
    "message_id": "uuid",
    "timestamp": "ISO8601"
  }
}
```

### 注意事项

- `ws_send` 只在 Web 消息处理上下文中有效，CLI 调用时为 None
- `send_message` 工具执行后，LLM 的 follow-up 回复仍然会作为最终的一条消息发出
- 如果 stream 正在进行中收到 `agent_message`，需要先 finalize stream（渲染 MD + 追加 actions）
- `agent_message` 不经过 renderMarkdown 的 stream 路径，直接调用 `addMsg()`
