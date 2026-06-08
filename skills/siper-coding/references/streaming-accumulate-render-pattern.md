# 流式响应气泡渲染模式：无聚合（每个 delta 独立气泡）

## 背景

流式响应（streaming）的前端渲染有两种模式：

### 模式 A：累积后一次性渲染（已废弃，v0.7.0‑v0.8.3）

stream_delta 时只累加文本到内存变量 `_streamAcc`，stream_end 时用 `addMsg()` 一次性渲染。

问题：
- 一次完整回复只产生 **1 条** assistant 消息，用户无法看到流式帧的边界
- 与 Hermes‑Web‑UI（xterm 终端）行为不一致
- 用户要求展开多个消息时无法满足

### 模式 B：无聚合，每个 delta 独立气泡（当前，v0.8.4+）

每个 `stream_delta` 消息到达时，创建独立的 `msg-row agent` DOM 结构并 `appendChild` 到聊天容器。

```js
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.type === 'stream_delta') {
    _streamAcc += d.delta || '';
    const chatEl = document.getElementById('chatMessages');
    if (!chatEl) return;
    // Each delta creates its own message bubble (no aggregation)
    const row = document.createElement('div');
    row.className = 'msg-row agent';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = '🤖';
    const bubble = document.createElement('div');
    bubble.className = 'msg-body';
    bubble.appendChild(document.createTextNode(d.delta || ''));
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatEl.appendChild(row);
    chatEl.scrollTop = chatEl.scrollHeight;
  } else if (d.type === 'stream_end') {
    // Reset streaming state
    _streamAcc = '';
    isSending = false;
    // ... reset UI buttons, play sound, etc.
  }
};
```

优点：
- 每个 delta 帧都可见，用户能感知流式进度
- 与 Hermes‑Web‑UI（xterm 终端）行为一致
- 代码直观，不维护复杂的聚合 DOM 引用

注意：
- 不需要 `_streamBubble`、`_streamRow` 等 DOM 引用变量
- `_streamAcc` 仍保留用于 debug/元数据，但不用于 DOM 渲染
- `stream_end` 时不再创建气泡，只重置状态和 UI

## 状态变量

| 变量 | 类型 | 用途 |
|------|------|------|
| _streamAcc | string | 累加的响应文本（仅用于元数据/debug），stream_end 时清空 |
| _streamRawData | object/null | stream_end 时保存的完整响应数据（用于 debug 显示） |

不再需要：`_streamBubble`、`_streamRow`

## 用户偏好

用户明确要求无聚合模式（2026‑07‑21）："在 siper 上实现无聚合"。每个 stream_delta 产生独立气泡。
