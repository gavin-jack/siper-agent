# SiPer 启动与重启方式

## 正确方式

**永远不要用 `nohup`、`disown`、`&`、`setsid` 等 shell 后台操作。** 安全策略会拦截。

### 启动

```python
terminal(
  background=True,
  command="cd /home/gavin/.siper && /home/gavin/.hermes/hermes-agent/venv/bin/python3 siper.py",
  notify_on_complete=True
)
```

### 重启流程

1. 先 kill 旧进程：`pkill -f "python3.*siper"`
2. 等待 1-2 秒
3. 用 `terminal(background=True)` 启动新进程
4. 等待 3 秒后验证：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9724/`

### 验证

```bash
# 检查端口
ss -tlnp | grep 9724

# 检查 HTTP
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9724/

# 检查进程
ps aux | grep siper
```

## 启动注意事项

- 必须用 `/home/gavin/.hermes/hermes-agent/venv/bin/python3`（venv 里有 openai SDK）
- 不要用 `LONGCAT_API_KEY=""` 空字符串前缀启动（会覆盖 config.json 中的有效 key）
- 启动后终端无任何输出（日志已重定向到内存/WARNING 级别）
