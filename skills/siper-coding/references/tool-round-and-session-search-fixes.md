# Tool Round Increment & Session Search Fixes

## 背景
- `ai_agent/core/agent.py` 中的 `_handle_tool_calls` 在递归调用时未递增 `_tool_round` 参数，导致工具调用轮次统计不准确，可能在达到上限前出现无限循环。已修复为 `+1`。
- `tools/session_search_tool.py` 原先查询 SQLite 的 `title`、`content` 列，这些列在当前 `data/sessions.db` schema 中不存在，仅保留 `session_id, user_id, created_at, ended_at, context, metadata`。查询已改为仅使用 `session_id, created_at, context`，并相应调整结果构造与预览生成逻辑。

## 影响
- 正确的工具调用轮次限制防止了潜在的工具调用死循环。
- `session_search` 现在能在真实的会话数据库上工作，返回基于 `context` 的搜索结果。

## 操作步骤
1. 确认 `agent.py` 中的递归调用已改为 `..._tool_round=_tool_round + 1`。
2. 确认 `session_search_tool.py` 中的 SQL 语句为:
   ```sql
   SELECT session_id, created_at, context FROM sessions WHERE context LIKE ?
   ```
3. 运行功能性测试，例如 `session_search {"query":"test"}`，验证返回结构 `{id, title:"", preview, created_at}`。

## 关联文档
- `references/assistant-content-tool-calls-conflict.md`（工具调用冲突处理）
- `references/_tool_round递归未递增 bug.md`（已合并至本文件）
