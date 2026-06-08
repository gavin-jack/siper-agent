# 聊天输入框按钮状态管理模式

## 场景

聊天页面输入框的发送按钮和停止按钮状态管理。

## 需求

1. 发送按钮在无法发送时置灰（disabled）
2. 停止按钮在消息发送后显示，未发送时隐藏
3. 停止按钮点击后发送 WS stop 命令
4. 机制参考 "SiPer正在思考" 页面的显示/隐藏

## 实现模式

### HTML 结构

```html
<div class="chat-input-area">
  <div class="chat-input-wrapper">
    <textarea id="chatInput" placeholder="输入消息..." rows="1"></textarea>
  </div>
  <button id="sendBtn" onclick="sendMessage()">发送</button>
  <button id="stopBtn" class="hidden" onclick="stopGeneration()" title="停止生成">■</button>
</div>
```

关键点：
- stopBtn 默认 `class="hidden"`
- 两个按钮并列，不互斥（stopBtn 隐藏时不占空间）

### CSS 样式

```css
.chat-input-area button:disabled {
  background: var(--border);
  cursor: not-allowed;
  opacity: 1;
}
#stopBtn {
  background: var(--red, #e53e3e);
}
#stopBtn:hover {
  background: var(--red, #e53e3e);
  opacity: 0.85;
}
```

- sendBtn disabled 样式复用 `.chat-input-area button:disabled`
- stopBtn 用 `--red` 变量，不需要额外 disabled 样式（停止按钮始终可点击）

### 前端 JS 逻辑（page-chat.js）

```javascript
let isSending = false;

function sendMessage() {
  // ... 获取输入文本 ...
  if (isSending) return;  // 防重复发送

  isSending = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('stopBtn').classList.remove('hidden');

  // ... 发送 WS 消息 ...
  // ... 显示 typing indicator ...
}

function stopGeneration() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop' }));
  }
  // 立即重置 UI，不等服务端确认
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.classList.add('hidden');
  const typingEl = document.getElementById('typing');
  if (typingEl) typingEl.className = 'typing';
}
```

### 前端 JS 逻辑（app.js - WS 消息处理）

在 `response` 和 `error` 分支中重置按钮状态：

```javascript
} else if (d.type === 'response') {
  document.getElementById('typing').className = 'typing';
  // ... 显示回复 ...
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.classList.add('hidden');
} else if (d.type === 'error') {
  document.getElementById('typing').className = 'typing';
  // ... 显示错误 ...
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.classList.add('hidden');
} else if (d.type === 'stopped') {
  document.getElementById('typing').className = 'typing';
  addMsg('⏹ 已停止生成', 'system');
}
```

在 `onclose` 中也要重置：

```javascript
ws.onclose = (e) => {
  setConnected(false);
  document.getElementById('typing').className = 'typing';
  const sb = document.getElementById('stopBtn');
  if (sb) sb.classList.add('hidden');
  // ...
};
```

### 后端逻辑（siper_web.py）

在 WS 接收器循环中添加 stop 处理：

```python
elif data.get("type") == "stop":
    logger.info(f"收到停止请求：conn={conn_id}")
    consumer_task.cancel()
    # 为后续消息重建 consumer
    consumer_task = asyncio.create_task(_ws_msg_consumer(ws, conn_id))
    await ws.send(json.dumps({"type": "stopped", "message": "Generation stopped"}))
```

关键点：
- stop 消息在接收器循环中直接处理，**不入队**
- cancel consumer_task 后必须重建，否则后续消息无法处理
- 发送 `stopped` 确认让前端显示停止提示

## 状态流转

初始状态: sendBtn enabled, stopBtn hidden, typing hidden
    ↓ sendMessage()
发送中: sendBtn disabled, stopBtn visible, typing active
    ↓ 收到 response/error
初始状态: sendBtn enabled, stopBtn hidden, typing hidden
    ↓ 点击 stopBtn
停止中: sendBtn enabled, stopBtn hidden, typing hidden (立即重置)
    ↓ 收到 stopped
初始状态 + "⏹ 已停止生成" 系统消息

## 边界情况

1. **WS 断开时**：onclose 中必须隐藏 stopBtn，否则重连后 stopBtn 仍显示
2. **重复发送**：isSending guard 防止同一消息发送两次
3. **stop 后立即发送**：stopGeneration() 立即重置 UI，sendMessage() 可以立即执行
4. **setConnected 冲突**：setConnected(false) 会设置 sendBtn.disabled = true，但 onclose 中 stopBtn 已隐藏，重连后 setConnected(true) 会恢复 sendBtn
