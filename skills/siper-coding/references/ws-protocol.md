# Siper WebSocket 协议参考

## 连接信息

- **端口**: 19725（HTTP 端口 19724 + 1）
- **URL 格式**: `ws://<host>:19725`
- **认证**: 已禁用（v0.4.18+），服务端直接接受连接

## 连接流程

1. 客户端连接 `ws://<host>:19725`
2. 服务端发送 `{type: "connected", connection_id: "...", session_id: "..."}`
3. 后续消息循环

## 消息类型

### 客户端 → 服务端

#### 发送消息
```json
{
  "type": "message",
  "content": "用户输入文本",
  "session_id": "可选，会话ID",
  "images": [
    {
      "data": "data:image/png;base64,...",
      "mime": "image/png",
      "name": "screenshot.png"
    }
  ]
}
```

#### Ping
```json
{"type": "ping"}
```

#### 停止生成
```json
{"type": "stop"}
```

客户端发送 `stop` 消息后，服务端会：
1. 取消当前 consumer_task（停止正在处理的 LLM 调用）
2. 重新创建 consumer_task（为后续消息准备）
3. 发送 `{type: "stopped", "message": "Generation stopped"}` 确认

**注意**：前端应在发送 stop 后立即重置 UI（不等待服务端确认），避免用户等待。

### 服务端 → 客户端

#### 连接成功
```json
{"type": "connected", "connection_id": "xxx", "session_id": "xxx"}
```

#### 流式回复（streaming）
```json
{"type": "stream_start", "session_id": "xxx"}
{"type": "stream_chunk", "delta": "你好", "content": "", "finish": false}
{"type": "stream_chunk", "delta": "！", "content": "", "finish": false}
{"type": "stream_end", "delta": "", "content": "你好！", "finish": true}
```

#### 会话创建
```json
{"type": "session_created", "session_id": "xxx"}
```

#### 错误
```json
{"type": "error", "message": "错误描述"}
```

#### 停止确认
```json
{"type": "stopped", "message": "Generation stopped"}
```

#### 队列状态（排队时推送）
```json
{"type": "queue_status", "position": 2, "message": "排队中，当前位置：2"}
```

## 消息队列机制

- 每个 WS 连接有独立的 `asyncio.Queue`
- 接收器循环：消息入队，立即返回
- Consumer 任务：串行处理队列中的消息
- 连接断开时队列自动清理
- **stop 消息**：在接收器循环中处理（不入队），直接 cancel consumer_task 并重建

## 图片处理流程

1. 前端：File → FileReader → base64 data URL
2. WS 发送：`{type: "message", content: "...", images: [{data, mime, name}]}`
3. 后端：解码 base64 → 保存到 `/tmp/siper_uploads/`
4. agent.py：`_build_user_content()` 将图片转为 `[Image: /path]` 格式
5. 视觉模型：通过 multimodal content 数组接收图片

## 会话管理

- 无 session_id：使用 conn_id 作为会话标识
- 首次消息：session_id 为空时自动创建会话
- 会话持久化：AI 回复后显式持久化

## 调试工具

WS 连通性测试脚本：`scripts/test_ws_connectivity.py`
```
