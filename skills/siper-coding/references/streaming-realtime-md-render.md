# 流式实时 MD 渲染模式（v0.9.35+）

## 问题

后端 siper_web.py 发送 `stream_delta`（每个 token）+ `stream_end`（流结束），但前端 app.js 的 `onmessage` 完全没有处理这两个消息类型，只有非流式的 `response` 处理（直接 JSON.stringify 输出）。

## 架构

```
后端 siper_web.py                    前端 app.js
─────────────────                    ──────────
_send_stream_delta(delta)  ──→  stream_delta handler
  └→ ws.send({type: "stream_delta",     └→ 累加 streamText
       delta, session_id})              └→ 重新 renderMarkdown(streamText)

agent.process_message()  ──→  stream_end handler
  └→ ws.send({type: "stream_end",       └→ 最终 MD 渲染
       session_id, data: result})       └→ 追加 meta + tool calls
                                        └→ 手动创建复制/插入按钮
                                        └→ 重置 stream 状态
```

## 关键实现细节

### 1. streamText 变量（不能用 DOM 读）

```js
let streamText = '';  // 累积原始文本

// ❌ 错误：从 DOM 读会拿到 [object HTMLDivElement]
const fullText = streamBody.textContent + d.delta;

// ✅ 正确：用变量累积
streamText += d.delta;
```

原因：`renderMarkdown()` 返回 DOM 节点，`appendChild` 后 `textContent` 会转成 `[object HTMLDivElement]`。

### 2. stream_delta 处理

```js
streamText += d.delta;
if (!streamBubble) {
  // 第一个 delta：创建 bubble，不创建 actions
  streamBubble = addMsg(streamText, 'agent', null, true);
  streamBody = streamBubble.querySelector('.msg-body');
} else {
  // 后续 delta：清空 body，重新渲染
  streamBody.textContent = '';
  streamBody.appendChild(renderMarkdown(streamText));
  // 自动滚动
  msgs.scrollTop = msgs.scrollHeight;
}
```

### 3. stream_end 处理

```js
// 最终渲染
streamBody.textContent = '';
streamBody.appendChild(renderMarkdown(streamText));

// 追加 meta
appendMeta(streamBody, meta);
renderToolCalls(streamBody, data.tool_call_steps);

// 手动创建按钮（引用 streamText，不用 buildActions 闭包）
const actions = document.createElement('div');
actions.className = 'msg-actions';
const copyBtn = document.createElement('button');
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(streamText);  // 引用 streamText
});
actions.appendChild(copyBtn);
bubble.appendChild(actions);

// 重置状态
streamBubble = null;
streamBody = null;
streamText = '';
```

### 4. stopped/error 必须重置状态

```js
// stopped 处理
if (streamBubble && streamBody) {
  // 先为已累积的文本添加按钮
  addActionsToBubble(streamBubble, streamText);
}
streamBubble = null;
streamBody = null;
streamText = '';

// error 处理
streamBubble = null;
streamBody = null;
streamText = '';
```

### 5. addMsg 新增 noActions 参数

```js
function addMsg(text, cls, meta, noActions) {
  // ...
  if (isAgent) {
    // ...
    if (!noActions) bubble.appendChild(buildActions());
  }
}
```

原因：`buildActions()` 定义在 `addMsg` 内部，闭包捕获 `text` 参数。流式渲染时传入的是快照，不是引用。

## 表格识别改进（v0.9.35+）

### `||` 是行分隔符，不是列分隔符

```
|A| B || C| D|  → 两行：|A| B| 和 |C| D|
```

实现：
```js
const rawRows = line.split('||').map(s => s.trim()).filter(Boolean);
const subRows = rawRows.map(r => {
  let s = r.trim();
  if (!s.startsWith('|')) s = '| ' + s;
  if (!s.endsWith('|')) s = s + ' |';
  return s;
});
```

### 分隔行跳过

```js
const _isSep = (s) => /^\s*\|?[\s\-:|]+\|?\s*$/.test(s) && s.includes('-');

// 收集 tableRows 时跳过分隔行
if (_isSep(cl)) { j++; continue; }  // 不 break，继续向后扫描
```

## 文件变更

- `core.js`：connectWS 的 onmessage 中添加 stream_delta/stream_end/stopped/error 处理（⚠️ 不是 app.js — app.js 未被 index.html 引用）
- `core.js`：addMsg 新增 `noActions` 参数
- `core.js`：agent 分支 `body.textContent` → `renderMarkdown(text)`
- `core.js`：表格识别改进（`||` 行分隔符、分隔行跳过、标题片段过滤）
- `core.js`：stream_delta 处理中，用 `_streamAcc` 变量累积文本（不用 DOM textContent 读取）
- `core.js`：stopped/error 处理中重置 `_streamAcc`/`_streamBubble`/`_streamBubbleWrap`/`_streamRow`

## ⚠️ app.js 未被 index.html 引用（v0.9.35+）

`app.js` 的修改全部无效！实际 WS 连接和消息处理在 `core.js` 的 `connectWS()` 中。
所有流式渲染修复必须在 core.js 中完成。

## 验证

1. 发送消息，观察 bubble 是否实时更新（每个 token 到达时 MD 重新渲染）
2. 表格是否正确渲染（包括 `||` 格式和分隔行）
3. 停止生成后，已累积的文本是否有复制/插入按钮
4. 错误后，下一条消息是否正常流式渲染

## 已知问题（v0.9.37+）

- `##` 标题被 `||` 连接时仍可能进入表格渲染（已添加 `filter(s => !s.startsWith('#'))` 修复）
- Tab 分隔内容可能被误渲染为表格单元格（待调查）
- `_streamAcc` 变量名（v0.9.37+ 更新）：实际代码中用 `_streamAcc` 而非 `streamText`，注意变量名一致性
