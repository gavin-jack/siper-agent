# Siper 项目审计方法

## 会话扫描 SQL

在 `~/.hermes/profiles/coding/state.db` 中查询所有涉及 siper 的用户消息：

```sql
SELECT DISTINCT s.id, s.started_at, s.model, m.content
FROM sessions s
JOIN messages m ON m.session_id = s.id
WHERE m.role = 'user'
  AND (LOWER(m.content) LIKE '%siper%'
       OR LOWER(m.content) LIKE '%siper_web%'
       OR LOWER(m.content) LIKE '%工具注册%'
       OR LOWER(m.content) LIKE '%tool_registry%'
       OR LOWER(m.content) LIKE '%消息队列%'
       OR LOWER(m.content) LIKE '%网关控制%'
       OR LOWER(m.content) LIKE '%全局设置%'
       OR LOWER(m.content) LIKE '%图片识别%'
       OR LOWER(m.content) LIKE '%check_fn%'
       OR LOWER(m.content) LIKE '%toolset%'
       OR LOWER(m.content) LIKE '%自注册%'
       OR LOWER(m.content) LIKE '%外观%'
       OR LOWER(m.content) LIKE '%agent%')
ORDER BY s.started_at ASC
```

注意：sqlite3.Row 不支持 `.get()`，用 `row["column"]` 访问。

## 代码验证方法

对每个需求，用以下方式验证：
1. `git -C /home/gavin/.siper log --oneline` — 查找相关 commit
2. `grep -r "关键函数名" /home/gavin/.siper/` — 确认代码存在
3. 直接读取关键文件确认实现

## 历史审计结果（2026-05-14）

共 298 个会话，69 条涉及 siper 的用户消息，提取出 20 项改进要求，全部完成。
最新版本：v0.4.0，最新 commit：a81ab75。
