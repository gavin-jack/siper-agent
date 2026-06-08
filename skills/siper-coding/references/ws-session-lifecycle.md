# WS 会话生命周期管理

## 架构模式

WS 连接的会话管理采用"连接级持久会话 + AI 回复后显式持久化"模式（v0.4.16+）。

**认证已禁用后的连接流程（v0.4.35+）**：

```
客户端                    WS Handler                SessionManager
  |                          |                          |
  |--- WS connect ---------->|                          |
  |                          |  create_session()        |
  |                          |  -> active_sessions      |
  |                          |  -> _unsaved_sessions.add|
  |<-- connected + session_id|                          |
  |                          |                          |
  |--- message ------------->|  _process_ws_message()   |
  |                          |  add_message(user_msg)   |
  |                          |  -> 内存写入（跳过DB）    |
  |                          |  agent.process_message() |
  |                          |  add_message(ai_reply)   |
  |                          |  -> 内存写入（跳过DB）    |
  |                          |  if success:             |
  |                          |    persist_session()     |
  |                          |    -> _save_session +    |
  |                          |      _save_all_messages  |
  |                          |    -> _unsaved.discard   |
  |<-- stream_start ---------|                          |
  |<-- stream_chunk ---------|  (流式推送)              |
  |<-- stream_chunk ---------|                          |
  |<-- stream_end -----------|  (完整内容+统计)         |
  |                          |                          |
  |--- disconnect ---------->|  finally:                |
  |                          |  if sid in _unsaved:     |
  |                          |    active_sessions.pop   |
  |                          |    _unsaved.discard      |
  |                          |  -> session 完全丢弃     |
```

**关键变更（v0.4.35）**：认证已禁用后，ws_handler 不再等待 auth 消息，连接建立后直接创建会话并发送 connected。移除了 `await asyncio.wait_for(ws.recv(), timeout=10)` 调用。

## 关键数据结构

```python
# siper_web.py 中
_conn_sessions: Dict[str, str] = {}  # conn_id -> session_id

# session_manager 中
active_sessions: Dict[str, ConversationSession] = {}
_unsaved_sessions: Set[str]  # 尚未写入数据库的 session_id（无 AI 回复）
```

## 持久化规则（v0.4.16+）

| 场景 | session 是否持久化 | 消息是否持久化 |
|------|-------------------|---------------|
| AI 成功回复 | 是的 persist_session() | 是的 所有消息写入 DB |
| LLM 失败/异常 | 否 不持久化 | 否 不写入 DB |
| 用户发消息后断开 | 否 不持久化 | 否 不写入 DB |
| 用户点击"新会话" | 否 旧 session 丢弃 | 否 不写入 DB |
| 服务重启（有 AI 回复的） | 是的 已在 DB | 是的 已在 DB |

## 消息流程

1. **连接建立**：WS 连接后直接 `create_session("web_user")`，写入 active_sessions + _unsaved_sessions
2. **返回 session_id**：connected 事件包含 session_id，前端替代 wsConnId
3. **消息处理**：`_conn_sessions.get(conn_id)` 获取持久 session_id
4. **add_message**：如果 session 在 _unsaved_sessions 中，只存内存不写 DB
5. **AI 成功后**：调用 `persist_session(session_id)`，一次性写入 session 记录 + 所有消息
6. **new_session**：丢弃旧的 unsaved session（如果存在），创建新 session
7. **断开清理**：如果 session 仍在 _unsaved_sessions 中，直接从内存丢弃

## API 查询行为

- `api_get_sessions`：跳过 _unsaved_sessions 中的 session（前端看不到未回复的会话）
- `api_get_session_messages`：跳过 _unsaved_sessions 中的 session
- `loadRecentSession`：不会加载到未持久化的 session

## 启动清理

服务启动时执行防御性清理：
- 删除没有 messages 的 session 记录
- ~~删除只有 user 消息（无 assistant 回复）的 session~~（v0.4.31 修复：不再删除，这些是合法的"在途"状态）

## 流式推送（streaming）

AI 回复采用流式推送模式：
1. `stream_start` — 前端创建空消息气泡
2. `stream_chunk` — 逐段推送 delta 文本，前端 `bodyEl.textContent += d.delta` 追加
3. `stream_end` — 推送完整 content + stats_line + usage + tools_used + skills_active，前端收尾

## 常见陷阱

- 忘记调用 persist_session -> session 只在内存中，重启丢失
- session_id 不一致 -> 每次连接创建新会话
- finally 中未清理 _conn_sessions -> 内存泄漏
- 在 _unsaved_sessions 中的 session 被 api_get_sessions 返回 -> 修复：查询时跳过
- **认证禁用后 ws_handler 残留 auth 等待** — 禁用认证时必须同步移除 ws_handler 中 `await asyncio.wait_for(ws.recv(), timeout=10)`，否则连接 10 秒后超时断开循环（v0.4.35 修复）
