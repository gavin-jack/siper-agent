# LLM 空响应调查（2026-05-17）

## 背景

用户报告 96d13feb 会话中 67% assistant 消息 content 为空字符串。

## 调查过程

1. 定位会话数据库：`/home/gavin/.siper/data/sessions.db`（非根目录空 db）
2. 分析 96d13feb 会话：66 条消息，title 为空，22/33 条 assistant 消息 content=''
3. 模式：短用户输入（"a"/"j"/"s"等）时 assistant 回复为空，长消息时正常
4. 确认"没有找到 siper 的源码目录"不是 siper 代码中的字符串，是 Agent（Hermes/007）在对话中生成的回复

## 根因分析

LongCat API 对短/无意义消息返回格式正确但 content 全为空的 SSE 流（chunk_count>0, received_done=True）。这不是网络层面的空响应，llm_client 层检测不到。

## 已应用的修复

agent.py 三处补丁：
1. `_llm_call` 流式分支：空 content + 无 tool_calls 时降级到非流式调用
2. `_llm_call` 非流式分支：空 content + 无 tool_calls 时重试，耗尽后返回错误消息
3. `process_message`：空 content + 无 tool_results 时标记 is_llm_error

## 未解决的问题

- 前端 `_finalizeStreamMsg` 对空 content 未做处理（bodyEl 仍为空，显示空气泡）
- 补丁与 v0.6.22 "不替换为空响应"策略存在矛盾
- 用户要求停止进一步修复

## 数据验证方法

```python
import sqlite3
conn = sqlite3.connect("/home/gavin/.siper/data/sessions.db")
c = conn.cursor()
c.execute("SELECT session_id, COUNT(*) as total, SUM(CASE WHEN content='' AND role='assistant' THEN 1 ELSE 0 END) as empty FROM messages WHERE role='assistant' GROUP BY session_id HAVING empty > 0")
for row in c.fetchall():
    print(f"{row[0][:12]}... total={row[1]} empty={row[2]} pct={row[2]/row[1]*100:.0f}%")
```
