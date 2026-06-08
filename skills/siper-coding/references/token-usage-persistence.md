# Token 用量持久化到 SQLite（v0.9.87z）

## 现象

服务重启后 token 用量统计归零，历史记录丢失。

## 根因

`_token_usage_history` 是内存列表（`siper_web.py` 全局变量），服务重启后清空。

## 修复方案

利用已有的 `agent.session_manager._db_connection`（sessions.db）创建 `token_usage` 表：

### 1. 启动时加载历史

```python
def _init_token_db(db_conn):
    global _token_usage_history
    cur = db_conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT NOT NULL,
            model TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        )
    """)
    cur.execute("SELECT time, model, prompt_tokens, completion_tokens, total_tokens FROM token_usage ORDER BY id DESC LIMIT ?", (_TOKEN_USAGE_MAX,))
    rows = cur.fetchall()
    _token_usage_history = [{"time": r[0], "model": r[1], "prompt_tokens": r[2], "completion_tokens": r[3], "total_tokens": r[4]} for r in reversed(rows)]
    db_conn.commit()
```

在 `main()` 中 agent 初始化后调用：
```python
if agent.session_manager._db_connection:
    _init_token_db(agent.session_manager._db_connection)
```

### 2. 写入时同步到 DB

```python
def _save_token_to_db(db_conn, entry):
    cur = db_conn.cursor()
    cur.execute("INSERT INTO token_usage (time, model, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (entry["time"], entry["model"], entry["prompt_tokens"], entry["completion_tokens"], entry["total_tokens"], time.time()))
    # Trim old entries
    cur.execute("SELECT COUNT(*) FROM token_usage")
    count = cur.fetchone()[0]
    if count > _TOKEN_USAGE_MAX:
        cur.execute("DELETE FROM token_usage WHERE id IN (SELECT id FROM token_usage ORDER BY id ASC LIMIT ?)", (count - _TOKEN_USAGE_MAX,))
    db_conn.commit()
```

在 token 记录写入时调用：
```python
if agent and agent.session_manager._db_connection:
    _save_token_to_db(agent.session_manager._db_connection, entry)
```

## 通用模式：内存数据持久化

任何需要在重启后保留的内存数据（统计、计数、历史记录）：
1. 利用已有的 `agent.session_manager._db_connection`（不用新建连接）
2. 启动时 `CREATE TABLE IF NOT EXISTS` + `SELECT` 加载到内存
3. 写入时 `INSERT` + 定期 trim
4. 内存列表作为缓存，DB 作为持久层

## 诊断

1. 重启前 `curl /api/token` 有数据，重启后 `total_requests: 0`
2. `sqlite3 agents/default/sessions.db "SELECT COUNT(*) FROM token_usage"` 确认表存在
