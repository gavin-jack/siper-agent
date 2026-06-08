# Per-Agent Sessions DB 迁移记录（v0.9.22）

## 变更背景
用户要求将 SiPer 的对话数据库从全局 `data/sessions.db` 迁移到对应 agent 文件夹内，实现 per-agent 数据隔离。

## 变更内容

### siper_web.py
```python
# 旧
data_dir=str(PROJECT_ROOT / "data"),

# 新
data_dir=str(PROJECT_ROOT / "agents" / "default"),
```

### 数据库路径变化
- 旧：`/home/gavin/.siper/data/sessions.db`
- 新：`/home/gavin/.siper/agents/default/sessions.db`

## 迁移步骤

1. **备份旧库**（必须）：
   ```bash
   cp /home/gavin/.siper/data/sessions.db /home/gavin/.siper/data/sessions.db.full_backup
   ```

2. **修改代码**：`siper_web.py` 中 `AgentConfig.data_dir` 改为 `PROJECT_ROOT / "agents" / "default"`

3. **重启服务**：`SessionManager.__init__` 会自动 `mkdir -p` 并创建空库
   ```bash
   # 停止旧进程
   pkill -f siper_web.py
   # 用 terminal(background=true) 启动新进程
   cd /home/gavin/.siper && /home/gavin/.hermes/hermes-agent/venv/bin/python3 siper_web.py
   ```

4. **验证**：
   ```bash
   # 新库存在且为空
   ls -la /home/gavin/.siper/agents/default/sessions.db
   sqlite3 /home/gavin/.siper/agents/default/sessions.db "SELECT COUNT(*) FROM sessions;"
   # 旧库仍保留（不自动删除）
   ls -la /home/gavin/.siper/data/sessions.db
   ```

## 注意事项
- `SessionManager.__init__` 中 `self.data_dir.mkdir(parents=True, exist_ok=True)` 会自动创建 agent 目录
- 旧库 `data/sessions.db` 不会被自动删除，需手动清理
- 如果未来支持多 agent，每个 agent 的会话数据自然隔离在各自目录下
