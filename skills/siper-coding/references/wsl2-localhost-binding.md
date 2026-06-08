# WSL2 绑定地址与 Windows 访问

## 关键结论（v0.6.17 修正）

**WSL2 的 `127.0.0.1` 与 Windows 的 `localhost` 不共享。**
绑定 `127.0.0.1` 后 Windows 浏览器无法访问。

**必须绑定 `0.0.0.0`** 才能从 Windows 访问。

## 验证依据

- Hermes Web UI (8648)：绑定 `0.0.0.0`，Windows 浏览器正常访问
- Siper (9724)：绑定 `127.0.0.1`，Windows 浏览器无法访问
- Siper (9724)：绑定 `0.0.0.0` 后，Windows 浏览器正常访问

## 需同步修改 3 处

1. HTTP 服务：`asyncio.start_server(handle_request, "0.0.0.0", port)`
2. WS 服务：`ws_serve(ws_handler, "0.0.0.0", ws_port, ...)`
3. 端口预检：`_s.bind(("0.0.0.0", _port))`

**端口预检必须与绑定地址一致**，否则预检通过但实际绑定失败。

## 验证命令

```bash
ss -tlnp | grep -E '9724|9725'
# 应显示 0.0.0.0:9724 和 0.0.0.0:9725
```

Windows 浏览器访问 `http://localhost:9724/` 应返回 200。

## 历史误解（v0.6.16 错误认知）

之前认为 WSL2 的 `127.0.0.1` 与 Windows localhost 共享（参考 Hermes 8660 端口）。实际验证发现：
- Hermes 8660 实际绑定 `0.0.0.0`（不是 `127.0.0.1`）
- `netstat -ano` 在 Windows 侧看不到 8660 监听
- WSL2 的 localhost 转发机制与端口绑定方式有关，`0.0.0.0` 才能被 Windows 路由
