# SiPer 端口管理与 WS 地址配置（v0.6.6 更新）

## 端口绑定

SiPer 绑定 `0.0.0.0`（所有接口），可从 Windows 浏览器直接访问：
```python
# siper_web.py line 1663
http_server = await asyncio.start_server(handle_request, "0.0.0.0", port)
ws_server = await ws_serve(ws_handler, "0.0.0.0", ws_port, max_size=10 * 1024 * 1024)
```

## 端口冲突检测（v0.6.6 新增）

启动前用 `socket.bind()` 测试端口是否被占用：

```python
# siper_web.py — main() 函数中，asyncio.start_server 之前
for _test_port in [port, ws_port]:
    _s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        _s.bind(("0.0.0.0", _test_port))
    except OSError:
        logger.error(f"端口 {_test_port} 已被占用，请更换端口或停止占用进程")
        sys.exit(1)
    finally:
        _s.close()
```

**注意**：`socket` 必须在文件顶部 `import socket`，不要在函数内重复 import。

## 端口配置化（v0.6.6 新增）

端口从 `settings.yaml` 读取，优先级：CLI 参数 > settings.yaml > 默认 19724。

```python
# siper_web.py — main() 函数入口
_cfg_port = 19724
try:
    import yaml as _yaml
    _sf = PROJECT_ROOT / "settings.yaml"
    if _sf.exists():
        with open(_sf, "r", encoding="utf-8") as _f:
            _cfg = _yaml.safe_load(_f) or {}
        _cfg_port = int(_cfg.get("gateway", {}).get("webui", {}).get("port", 19724))
except Exception:
    pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else _cfg_port
```

settings.yaml 配置：
```yaml
gateway:
  webui:
    enabled: true
    host: "localhost"    # 显示给用户看的地址
    port: 19724          # 实际监听端口
```

## WS 地址配置（v0.6.6 修复）

### 前端 WS 连接（已正确）

前端 core.js 已使用动态主机名：
```javascript
const wsUrl = `${proto}//${location.hostname}:${wsPort}`;
```
**不需要修改**，这里已经是正确的。

### 后端 gateway endpoint 显示（v0.6.6 修复）

`/api/gateway` 接口返回的 endpoint 信息之前硬编码 `0.0.0.0`，改为动态获取：

```python
# siper_web.py — api_get_gateway()
def api_get_gateway():
    _host = socket.gethostname() or "localhost"
    services = [
        {"name": "HTTP Server", "type": "http",
         "endpoint": f"http://{_host}:{port}", "status": "running"},
        {"name": "WebSocket", "type": "ws",
         "endpoint": f"ws://{_host}:{ws_port}", "status": "running"},
        # ...
    ]
```

**注意**：`_host = socket.gethostname()` 不要加 `import socket` 局部导入——文件顶部已有 `import socket`。

## WS 超时断开机制（v0.6.13 已实现）

服务端已有 60s 超时检测 + 主动断开：
```python
raw = await asyncio.wait_for(ws.recv(), timeout=60)
# TimeoutError -> ws.close() -> break
```

浏览器端 3s 后自动重连（`setTimeout(connectWS, 3000)`）。无需客户端心跳。

## 与 Hermes 对比

| 特性 | Hermes | SiPer |
|------|--------|-------|
| 默认绑定 | 127.0.0.1 | 0.0.0.0 |
| 端口冲突检测 | ✅ connect 预检 | ✅ socket.bind (v0.6.6) |
| 配置化端口 | ✅ config.yaml | ✅ settings.yaml (v0.6.6) |
| WS 端点显示 | 动态 | 动态 (v0.6.6) |
| 安全限制 | API key 强制 | 无（纯内网使用） |
| WS 超时断开 | N/A | ✅ 60s (v0.6.13) |
