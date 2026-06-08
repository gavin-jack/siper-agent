# WSL2 WebSocket 连接调试指南

## 问题现象

浏览器前端 WS 连接显示 readyState=1（OPEN），bufferedAmount=0，但发送消息后 siper 后端日志无任何新消息。

## 根因（已确认 v0.6.11）

**WSL2 localhost 转发静默断开 TCP 连接**。TCP 连接在 WSL2 网络层断开，但 Chrome 的 WebSocket readyState 不会立即更新（仍显示 1/OPEN），bufferedAmount 也显示 0（因为 Chrome 认为连接正常，已"发送"）。

**这不是代码 bug，是 WSL2 网络特性。**

## 诊断方法

```bash
# 1. 检查是否有 ESTABLISHED 连接
ss -tnp | grep 19725

# 如果没有 ESTABLISHED 行，但浏览器 ws.readyState=1
# → 连接已静默断开，需要刷新页面
```

对比检查：
- `ws.readyState === 1` 且 `ss -tnp` 有 ESTABLISHED → 连接正常
- `ws.readyState === 1` 且 `ss -tnp` 无 ESTABLISHED → 静默断开，刷新页面

## 解决方法

**刷新页面**（browser_navigate 或 F5）重建 WS 连接。

刷新后 `ss -tnp` 应立即出现新的 ESTABLISHED 行。

## 环境

- siper 运行在 WSL2，监听 `0.0.0.0:19725`
- Chrome 运行在 Windows，通过 `ws://localhost:19725` 连接
- WSL2 的 127.0.0.1 与 Windows 共享（Windows 11 特性）
- 前端 JS 构建 WS URL：`ws://${location.hostname}:${parseInt(location.port)+1}`

## 已排除的原因

- Chrome WS frame 格式问题：raw socket 发送同样格式的消息，后端能正常接收
- websockets 库解帧问题：raw socket 测试证明库工作正常
- API Key 401：curl 测试 API 正常返回
- LLM API 间歇性空响应：是独立问题，不影响 WS 消息收发

## 历史记录

- v0.6.10 (2026-05-16)：发现此问题，当时未能确认根因
- v0.6.11 (2026-05-16)：通过对比 raw socket 测试（能收到）和浏览器测试（收不到），结合 ss -tnp 确认 TCP 连接不存在，确认根因为 WSL2 localhost 转发静默断开。刷新页面后恢复正常。
