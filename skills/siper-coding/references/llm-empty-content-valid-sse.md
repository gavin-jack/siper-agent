# LLM 返回有效 SSE 流但 Content 全为空

**状态：已修复（v0.6.4）**

## 现象

用户发送短消息（如 "a", "j", "s"）时，assistant 回复为空字符串。数据库中保存的 assistant 消息 content 字段为 `''`。前端显示空的消息气泡。

## 根因

LongCat API 对某些短/无意义消息返回**格式正确但 content 为空**的 SSE 流：

```
data: {"choices":[{"delta":{"content":""},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{...}}
data: [DONE]
```

此时 `chunk_count > 0` 且 `received_done == True`，llm_client 的空响应检测（`chunk_count == 0 && !received_done`）**不会触发重试**。

## 修复内容（v0.6.4）

在 `agent.py` 的 `_llm_call` 中，流式分支和非流式分支都增加了空 content 检测：

```python
content = "".join(collected_content)
# 空 content 检测：有效 SSE 流但 content 全为空且无 tool_calls
if not content.strip() and not collected_tool_calls:
    if attempt < max_attempts:
        self.logger.warning(f"LLM 流式返回空 content，重试（第 {attempt}/{max_attempts} 次）...")
        continue
    self.logger.error("LLM 流式返回空 content，已重试耗尽")
    content = "[抱歉，我没有理解你的问题，请换个方式描述]"
    collected_finish = 'error'
```

非流式分支同理，检查 `result['content']` 而非 collected_content。

**关键设计决策**：
- 检测条件必须排除 `collected_tool_calls` 非空的情况（LLM 直接调工具不说话是合法的）
- 重试复用已有的 `max_attempts=2` 循环（不新增重试计数器）
- 耗尽后将 finish_reason 设为 'error'，让上游 process_message 正确识别为 LLM 错误

## 与已有空响应检测的区别

| 场景 | chunk_count | received_done | llm_client 层捕获？ | agent.py 层捕获（v0.6.4）？ |
|------|-------------|---------------|-------------|---------|
| SSE body 完全为空（无 data: 行） | 0 | False | 是（重试3次） | 不需要 |
| 有 data: 行但所有 delta.content="" | >0 | True | 否 | 是（重试1次） |

## 数据验证

检查数据库中空回复比例（sessions.db 在 `data/` 子目录）：

```python
import sqlite3
conn = sqlite3.connect('/home/gavin/.siper/data/sessions.db')
c = conn.cursor()
c.execute("""
    SELECT s.session_id,
           SUM(CASE WHEN m.role='assistant' AND (m.content IS NULL OR TRIM(m.content)='') THEN 1 ELSE 0 END) as empty_cnt,
           SUM(CASE WHEN m.role='assistant' THEN 1 ELSE 0 END) as total
    FROM sessions s
    JOIN messages m ON s.session_id = m.session_id
    GROUP BY s.session_id
    HAVING empty_cnt > 0
""")
```

96d13feb 会话：22/33 条 assistant 消息为空（67%），全部集中在短消息（"a","j","s"等）。

## sessions.db 位置

**注意**：siper 的 sessions.db 在 `/home/gavin/.siper/data/sessions.db`，不是 `/home/gavin/.siper/sessions.db`。后者是空数据库（无表）。

## 关联

- `streaming-empty-response-fix.md` — SSE body 完全为空的场景
- `llm-retry-pattern.md` — 所有重试模式的汇总
