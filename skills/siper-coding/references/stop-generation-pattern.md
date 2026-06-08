# 停止生成功能实现模式

## 概述

用户点击停止按钮后，前端发送 WS `stop` 消息，后端设置停止标志并取消 consumer_task，前端立即重置 UI。

## 数据流

```
用户点击停止 → stopGeneration() → WS send({type:'stop'})
    ↓                                              ↓
前端立即重置 UI                          后端接收器收到 stop
(isSending=false, stopBtn隐藏)              ↓
                                    设置 _stop_events[conn_id]
                                            ↓
                                    cancel consumer_task
                                            ↓
                                    重建 consumer_task
                                            ↓
                                    WS send({type:'stopped'})
                                            ↓
                                    前端 onmessage 处理 stopped
                                    (再次重置 UI，防御性)
```

## 后端实现要点

### 1. 停止事件标志（_stop_events）

使用 `asyncio.Event` 而非仅 cancel consumer，因为 cancel 无法中断正在执行的 `_process_ws_message`（它可能在等待 LLM 响应）：

```python
# main() 函数级别
_stop_events: Dict[str, asyncio.Event] = {}

# ws_handler 中初始化
_stop_events[conn_id] = asyncio.Event()

# stop 处理
elif data.get("type") == "stop":
    logger.info(f"收到停止请求：conn={conn_id}")
    if conn_id in _stop_events:
        _stop_events[conn_id].set()
    consumer_task.cancel()
    consumer_task = asyncio.create_task(_ws_msg_consumer(ws, conn_id))
    await ws.send(json.dumps({"type": "stopped", "message": "Generation stopped"}))
```

### 2. _process_ws_message 中检查停止标志

在 `agent.process_message()` **返回后**、发送 response **前**检查停止标志：

```python
task_record["status"] = "done"

# 如果被停止，丢弃 response（不发往前端）
if _stop_events.get(conn_id) and _stop_events[conn_id].is_set():
    logger.info(f"生成已被用户停止，跳过发送响应：conn={conn_id}")
    _stop_events[conn_id].clear()
    return

# 正常发送 response
resp = {"type": "response", "session_id": session_id, "data": result}
await ws.send(json.dumps(resp, ensure_ascii=False, default=str))
```

**为什么不在 agent.process_message() 内部取消？**
- `agent.process_message()` 是长时间运行的 async 调用（等待 LLM API）
- `asyncio.Task.cancel()` 只能中断 `await` 点，不能中断已经在执行的 Python 代码
- 实际效果：cancel 让 consumer 在下次 `await q.get()` 时退出，但当前正在处理的 message 会继续完成
- 所以采用"完成后丢弃 response"的策略

### 3. 清理

在 ws_handler finally 中清理：
```python
_stop_events.pop(conn_id, None)
```

## 前端实现要点

### 1. stopGeneration() — 立即重置 UI

```javascript
function stopGeneration() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop' }));
  }
  // 立即重置，不等服务端确认
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.classList.add('hidden');
  const typingEl = document.getElementById('typing');
  if (typingEl) typingEl.className = 'typing';
}
```

### 2. WS onmessage 处理 stopped 消息

防御性重置（stopGeneration 已重置，但 stopped 消息到达时再次确保）：

```javascript
} else if (d.type === 'stopped') {
  isSending = false;
  const _sb = document.getElementById('sendBtn');
  const _stb = document.getElementById('stopBtn');
  if (_sb) _sb.disabled = false;
  if (_stb) _stb.classList.add('hidden');
  const _te = document.getElementById('typing');
  if (_te) _te.className = 'typing';
}
```

### 3. WS onclose 中重置状态

WS 断开（60s 超时）时必须重置状态，否则 UI 卡在发送中：

```javascript
ws.onclose = (e) => {
  setConnected(false);
  const _te = document.getElementById('typing');
  if (_te) _te.className = 'typing';
  // 重置发送状态
  isSending = false;
  const _sb = document.getElementById('sendBtn');
  const _stb = document.getElementById('stopBtn');
  if (_sb) _sb.disabled = false;
  if (_stb) _stb.classList.add('hidden');
  addLog('warn', t('chat.disconnected'), currentLang);
  setTimeout(connectWS, 3000);
};
```

### 4. response/error 中重置状态

LLM 回复或出错后必须重置：

```javascript
} else if (d.type === 'response') {
  isSending = false;
  const _sb = document.getElementById('sendBtn');
  const _stb = document.getElementById('stopBtn');
  if (_sb) _sb.disabled = false;
  if (_stb) _stb.classList.add('hidden');
  // ... 处理响应数据
} else if (d.type === 'error') {
  isSending = false;
  const _sb = document.getElementById('sendBtn');
  const _stb = document.getElementById('stopBtn');
  if (_sb) _sb.disabled = false;
  if (_stb) _stb.classList.add('hidden');
  // ... 处理错误
}
```

## WS 消息类型汇总

| type | 方向 | 作用 |
|------|------|------|
| `stop` | 前端→后端 | 用户请求停止生成 |
| `stopped` | 后端→前端 | 确认停止完成 |
| `response` | 后端→前端 | LLM 回复 |
| `error` | 后端→前端 | 处理错误 |

## 关键约束

1. **stop 不入队**：在接收器循环中直接处理，不放入 asyncio.Queue
2. **必须重建 consumer**：cancel 后立即重建，否则后续消息无法处理
3. **前端立即重置**：不等服务端确认，点击后立即隐藏 stopBtn
4. **stopped 防御性重置**：stopped 到达时再次确保状态重置
5. **onclose 必须重置**：WS 断开时同样重置 isSending/sendBtn/stopBtn
6. **response/error 必须重置**：LLM 回复或出错后重置状态
