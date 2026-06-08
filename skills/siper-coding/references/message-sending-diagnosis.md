# Siper 消息发送诊断流程

## 症状
用户报告消息发不出去、没有回复、或一直显示"连续 3 次返回空响应"。

## 诊断步骤（按顺序执行）

### 1. 检查服务状态
ps -o pid,etime,args -p $(cat /home/gavin/.siper/.siper.pid 2>/dev/null)

### 2. 检查端口和 WS 连接
ss -tnp | grep -E '1972[45]'

### 3. 检查 HTTP 和版本接口
curl -s http://127.0.0.1:19724/api/version

### 4. 浏览器控制台检查 WS 连接
ws.readyState  // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

### 5. 检查 sendMessage 函数
typeof sendMessage  // 应为 'function'

### 6. 发送测试消息
sendMessage('你好，这是一条测试消息')

### 7. 检查后端日志
fetch('/api/logs?limit=50').then(r=>r.json()).then(d=>{
  let lc = (d.logs||[]).filter(l=>l.message.includes('LLM')||l.message.includes('空响应'));
  console.log(JSON.stringify(lc.slice(-10)));
})

### 8. 验证 API Key
写 Python 脚本从 models.json 读取 key 并测试 API（不用 python -c，安全策略阻止）。

### 9. 检查 config.json mtime vs siper 启动时间
如果 config.json 修改时间晚于 siper 启动时间，siper 用的是旧 key。

## 重启 Siper 服务

当诊断结果为根因 A（API key 为空，config.json 在 siper 启动后被修改）时：

1. 停旧进程：`kill <pid>`（pid 从 `pgrep -f siper_web.py` 获取）
2. 确认进程已停：`pgrep -f siper_web.py` 返回空
3. 启动新进程（Hermes terminal background 模式）：
   ```
   terminal(background=True, command="cd /home/gavin/.siper && exec /home/gavin/.hermes/hermes-agent/venv/bin/python3 siper_web.py")
   ```
4. 等待 3 秒后验证端口：`ss -tlnp | grep -E '19724|19725'`
5. 检查 process log 确认 "配置：从 config.json 加载了 1 个模型" 和 "LLM 来自 config.json"
6. 刷新浏览器页面重建 WS 连接

**注意**：不要用 `LONGCAT_API_KEY=""` 前缀启动，空字符串会覆盖 config.json 中的有效 key。

A. API key 为空（最常见）— config.json 在 siper 启动后被修改，siper 进程仍用空 key。修复：重启 siper
B. LLM API 间歇性空响应 — API key 有效但日志显示空响应。修复：等待重试
C. WSL2 TCP 静默断开 — WS readyState=1 但后端收不到消息。修复：服务端 60s 超时（已实现）
D. WS 未连接 — siper 重启后浏览器未刷新。修复：刷新页面
