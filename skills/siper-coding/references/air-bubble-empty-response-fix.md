# 空气泡（空消息气泡）修复模式（v0.9.87y）

## 现象

LLM 返回空 content 时（如 tool_call 轮次中 LLM 只返回 tool_calls 没有 content），
stream_end 仍然渲染消息气泡，产生空白"空气泡"。

## 根因

`core.js` 的 `stream_end` 处理中，没有检查 `_streamAcc` 是否为空。
agent.py 在空 content 时设置 `is_llm_error = True`，result 中 `success: false`，
但前端没有检查这个标志。

## 修复

### 流式 stream_end

```js
const _success = _data.success !== false;
// 空内容 + 无附件 + 失败 → 跳过渲染
if (!_streamAcc.trim() && _attachments.length === 0 && !_success) {
  // 重置状态但不渲染
  _streamAcc = '';
  _streamBubble = null;
  _streamBubbleWrap = null;
  _streamRow = null;
  isSending = false;
  // 恢复按钮状态...
  return;
}
```

### 非流式 response

```js
if (!_success) {
  addMsg(_content || '服务暂时没有响应，请重试', 'error');
} else if (!_content.trim() && !_data.attachments) {
  // 空内容无附件 → 跳过渲染
} else {
  // 正常渲染...
}
```

## 诊断

1. 看到空白消息气泡 = 此 bug
2. `browser_console` 检查 `document.querySelectorAll('.msg-row.agent')` 最后一个的 textContent 为空
3. 检查对应 WS stream_end 的 `data.success` 字段是否为 false

## 修复历史

- v0.9.87y (2026-08-06)：流式和非流式都加了空内容检查
