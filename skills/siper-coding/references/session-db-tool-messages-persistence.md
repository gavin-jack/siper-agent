# Session DB 持久化不完整 — Tool Calls 消息丢失

**发现时间**: 2026-05-23  
**修复 commit**: `8a449c1`

## 问题现象

用户在对话中看到 LLM 回复了很多内容（含工具调用过程），但在会话列表中点击该会话后，聊天区域只显示用户消息和最终回复，中间的 tool_calls 过程全部丢失。

## 根因

`agent.py` 中 `_handle_tool_calls()` 执行工具调用时，只将消息写入内存的 `self.conversation_history`，**没有调用 `session_manager.add_message()`** 持久化到数据库。

整个消息持久化链路只有两处：
1. `agent.py:304` — 用户消息 (`add_message(session_id, 'user', message)`)
2. `agent.py:380` — assistant 最终回复 (`add_message(session_id, 'assistant', response_content)`)

工具调用产生的 `assistant`(tool_call) 和 `tool`(result) 角色消息全部丢失。

## 修复方案

在 `_handle_tool_calls()` 中，每次工具执行完成后（成功和失败分支都加），调用 `session_manager.add_message()` 持久化两条消息：

```python
# assistant 消息（content=None，含 tool_calls）
await self.session_manager.add_message(
    session_id, 'assistant', None,
    tool_name=tool_call['name'], tool_call_id=tool_call_id,
)
# tool 消息（content=执行结果）
await self.session_manager.add_message(
    session_id, 'tool', formatted_result,
    tool_name=tool_call['name'], tool_call_id=tool_call_id,
)
```

## 连带修改

`session_manager.py` 中 `add_message()` 和 `ConversationSession.add_message()` 的 `content` 参数类型从 `str` 改为 `Optional[str]`，因为 assistant 的 tool_call 消息 content 为 `None`。

## 诊断方法

```bash
# 检查 DB 中是否有 tool 角色的消息
sqlite3 agents/default/sessions.db "SELECT DISTINCT role FROM messages;"
# 修复前只有: user, assistant
# 修复后应有: user, assistant, tool

# 检查特定会话的消息数量
sqlite3 agents/default/sessions.db "SELECT role, COUNT(*) FROM messages WHERE session_id='xxx' GROUP BY role;"
```

## 注意事项

- `session_manager.add_message()` 在 session 未 persist 时只存内存不写 DB（`_unsaved_sessions` 机制）
- `persist_session()` 在 `agent.process_message()` 成功返回后才被调用（`siper_web.py:2449`）
- 因此 tool 消息会在执行时先存内存，最终随 `persist_session()` 一起写入 DB
