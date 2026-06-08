# Siper Web 认证实现参考

## 认证架构

```
客户端                    服务端
  |                         |
  |-- GET / (无认证) ------>|  返回登录页 HTML
  |                         |
  |-- POST /api/auth/login->|  验证 key，返回 {success: true}
  |<-- {success: true} -----|
  |                         |
  |-- WS connect ---------->|  等待首条消息
  |-- {type:"auth",key:..}->|  验证通过
  |<-- {type:"connected"} --|
  |                         |
  |-- API req + Bearer ---->|  验证 Authorization header
  |<-- 200 + data ----------|
```

## 后端关键代码 (siper_web.py)

### AUTH_KEY 生成
```python
AUTH_KEY = os.environ.get("SIPER_AUTH_KEY", secrets.token_hex(16))
```

### check_auth 函数
```python
async def check_auth(request_text, full_path):
    path = full_path.split("?")[0]
    if path == "/" and request_text.startswith("GET"):
        return True
    if path == "/api/auth/login":
        return True
    for line in request_text.split("\r\n"):
        if line.lower().startswith("authorization:"):
            token = line.split(":", 1)[1].strip()
            if token.startswith("Bearer ") and token[7:] == AUTH_KEY:
                return True
    return False
```

### 路由链中的认证守卫（第一个条件）
```python
if not await check_auth(request, full_path):
    resp = {"error": "未认证", "message": "请提供有效的认证密钥"}, 401
elif path == "/api/auth/login" and method == "POST":
    resp = api_auth_login(body)
# ... 其余路由不变
```

### WS 首条消息认证
```python
async def ws_handler(ws):
    conn_id = str(id(ws))
    connections[conn_id] = ws
    ws._auth_ok = False
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        data = json.loads(raw)
        if data.get("type") != "auth" or data.get("key") != AUTH_KEY:
            await ws.send(json.dumps({"type": "error", "message": "未认证"}))
            await ws.close(4001, "未认证")
            return
        ws._auth_ok = True
        await ws.send(json.dumps({"type": "connected", ...}))
        async for raw in ws:
            # 正常消息处理
```

## 前端关键代码 (app.js)

### authKey 初始化（必须在 connectWS 之前）
```javascript
let authKey = localStorage.getItem('siper_auth_key') || '';
(function() {
  const params = new URLSearchParams(location.search);
  const urlKey = params.get('key');
  if (urlKey && urlKey !== authKey) {
    authKey = urlKey;
    localStorage.setItem('siper_auth_key', authKey);
  }
})();
```

### fetch 拦截器（自动注入 Authorization）
```javascript
const _origFetch = window.fetch;
window.fetch = async function(url, opts) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (authKey && !opts.headers['Authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + authKey;
    }
  }
  const resp = await _origFetch.call(this, url, opts);
  if (resp.status === 401) {
    authKey = '';
    localStorage.removeItem('siper_auth_key');
    showLoginModal();
  }
  return resp;
};
```

### WS onopen 发送 auth
```javascript
ws.onopen = () => {
  if (authKey) {
    ws.send(JSON.stringify({type: 'auth', key: authKey}));
  }
  setConnected(true);
};
```

## 禁用认证 (v0.4.18+)

认证已禁用。以下改动同时应用于后端和前端：

### 后端改动 (siper_web.py)
1. `check_auth()` 直接返回 True（跳过所有 HTTP 认证检查）
2. `api_auth_login()` 直接返回成功（不验证 key）
3. `ws_handler()` 中跳过 auth key 验证，直接设置 `ws._auth_ok = True`

### 前端改动 (app.js)
1. 移除 `authKey` 变量和 URL 参数读取逻辑
2. 移除 `loginModalShown` 变量
3. `connectWS()` 中不再根据 authKey 构建 WS URL，不发送 auth 消息
4. WS onclose 移除 4001 认证失败处理
5. WS onmessage 移除 '未认证' 错误弹窗（改为注释说明）
6. 移除 fetch 拦截器中的 Authorization header 注入和 401 处理（整个拦截器可移除）
7. `showLoginModal` / `hideLoginModal` 改为空函数壳（保留函数名避免其他代码报错）
8. 移除 `doLogin` 和 `copyKeyLink` 函数
9. i18n 中的 auth 相关条目可保留（不影响功能）

**关键**：禁用认证时必须同时修改后端和前端，否则前端仍会尝试发送 auth 消息或显示登录弹窗。

**恢复方法**：将上述改动反向操作即可恢复认证功能。

## 注意事项

1. GET / 和 /api/auth/login 豁免认证
2. WS 4001 关闭码表示认证失败
3. 启动日志打印含 key 的 URL
4. SIPER_AUTH_KEY 环境变量可固定密钥
5. **禁用认证是保留结构的** — 相关代码改为空操作而非删除，便于后续恢复
