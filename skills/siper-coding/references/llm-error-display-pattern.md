# LLM API 错误信息显示优化（v0.4.39）

## 问题

LLM API 错误时，错误信息被当作普通 Agent 消息传输，用户看到正常气泡里的错误文字，不够醒目。

## 解决方案

### 1. 后端错误信息格式统一

`llm_client.py` 中所有错误返回统一格式：`[LLM API 错误：具体原因]`

| 错误类型 | 格式 |
|---------|------|
| 空响应（非流式） | `[LLM API 错误：连续 3 次返回空响应，请检查 API 服务或稍后重试]` |
| 空响应（流式） | `[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]` |
| HTTP 错误 | `[LLM API 错误：HTTP {code}] {body[:200]}` |
| 网络错误 | `[LLM API 错误：网络连接失败] {e}` |
| JSON 解析失败 | `[LLM API 错误：响应格式异常] {e}` |
| 超时 | `[LLM API 错误：请求超时，请稍后重试]` |

### 2. WebSocket is_error 字段

siper_web.py 构建 stream_end/response 时设置 `is_error: not result.get("success", True)`。

### 3. 前端错误显示

流式：隐藏头像 + bubble 改 error 类 + row 居中。
非流式：`addMsg(content, 'error')`。

### 4. CSS

`.msg.error` 已有样式（居中、浅红背景、红字、边框）。
新增 `.msg-row.error { align-self: center; }`。

## 影响文件

- `ai_agent/core/llm_client.py`
- `ai_agent/core/agent.py`
- `siper_web.py`
- `webui/static/pages/core.js`
- `webui/static/style.css`

## 流式错误消息框 CSS 类组合

当流式响应出错时，前端生成的 DOM 结构：

```html
<div class="msg-row agent msg-row-horizontal error">
  <div class="msg-avatar-wrap" style="display:none">...</div>
  <div class="msg error" style="font-size:13px">
    <div class="msg-body">[LLM API 错误：...]</div>
  </div>
</div>
```

关键 CSS 类：
- `msg-row agent msg-row-horizontal error` — 行容器，`error` 类触发 `align-self: center` 居中
- `msg-avatar-wrap` 被 JS 设为 `display:none`（隐藏头像）
- `msg.error` — 气泡变浅红背景 `#fde8e8` + 红色文字 + 13px 字号 + 居中
- `agent-bubble` 类被 JS 移除，替换为 `error`

对应 CSS（style.css 第 231 行）：
```css
.msg.error { align-self: center; background: #fde8e8; color: var(--red); border: 1px solid #f5c6cb; font-size: 13px; }
```

对应 JS（core.js 1482-1499 行）：
```js
if (d.is_error) {
  const row = _streamCurrentMsgEl.closest('.msg-row');
  const bubble = _streamCurrentMsgEl.closest('.msg');
  if (row) {
    row.classList.add('error');
    const avatarWrap = row.querySelector('.msg-avatar-wrap');
    if (avatarWrap) avatarWrap.style.display = 'none';
  }
  if (bubble) {
    bubble.classList.remove('agent-bubble');
    bubble.classList.add('error');
    _streamCurrentMsgEl.style.fontSize = '13px';
  }
  if (d.content) _streamCurrentMsgEl.textContent = d.content;
}
```

## 陷阱：appendMeta 必须检查 error class（v0.5.5）

即使错误路径不主动调用 `appendMeta`，如果后端返回的 error 响应没有设 `is_error: true`（例如只设 `type: 'error'`），代码可能走正常回复路径调用 `_finalizeStreamMsg` → `appendMeta`，导致报错消息下方显示 `⬆️ 0 · ⬇️ 0` 等统计。

**修复**：在 `appendMeta` 函数开头加守卫：

```js
function appendMeta(container, meta) {
  // Don't show stats on error messages
  const bubble = container.closest('.msg');
  if (bubble && bubble.classList.contains('error')) return;
  // ... rest of the function
}
```

这样无论哪条路径调用了 appendMeta，只要 bubble 有 error class 就不渲染统计。

受影响位置：`webui/static/pages/page-chat.js` 的 `appendMeta` 函数。

## 陷阱：流式错误 delta 不要加 `\n` 前缀

流式错误消息通过 `yield {"delta": "..."}` 逐字符推送到前端。前端 body 使用 `white-space: pre-wrap`，会保留换行符。

**错误写法**：
```python
yield {"delta": "\n[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]", ...}
```

**正确写法**：
```python
yield {"delta": "[LLM API 错误：流式响应连续 3 次为空，请检查 API 服务或稍后重试]", ...}
```

`\n` 前缀会被渲染为空白行（在错误消息上方或下方）。所有流式错误分支（空响应/HTTP错误/连接失败/请求异常）均需注意此规则。

受影响位置：`llm_client.py` 的 `chat_completion_stream` 方法中所有 `yield {"delta": f"\\n[LLM API 错误：...]` 行。

## 陷阱：process_message 必须传播 LLM 错误状态（v0.5.6）

**根因**：`agent.py` 的 `_llm_call` 在 LLM 返回空响应时，最后一个 chunk 的 `finish_reason` 为 `"error"`，但 `process_message` 只记录日志，返回值仍然是 `success=True`。导致 `siper_web.py` 认为请求成功（`is_error=False`），前端走正常分支调用 `_finalizeStreamMsg` → `appendMeta`，错误消息下方显示 `⬆️ 0 · ⬇️ 0 │ 🔧 0 tools │ 🧩 0 skills │ ⏱️ 0ms` 等无意义统计。

**症状**：LLM 报错消息显示后，下方有统计行。

**修复**：在 `process_message` 中检测 `finish_reason == 'error'` 时，将返回值的 `success` 设为 `False`：

```python
is_llm_error = llm_response.get('finish_reason') == 'error'
if is_llm_error:
    self.logger.warning(f"LLM 返回错误 finish_reason，response_content={response_content[:100]!r}")

return {
    ...
    'success': not is_llm_error,  # 原来是 True
    'usage': usage,
}
```

受影响位置：`ai_agent/core/agent.py` 的 `process_message` 方法。

## 陷阱：content=None 导致 NOT NULL 约束失败（v0.9.87z+）

`agent.py:_handle_tool_calls()` 中 tool_calls 执行后写入 assistant 消息时传 `content=None`，但 `messages.content` 列是 `NOT NULL`。这会导致 SQLite 报错 `NOT NULL constraint failed: messages.content`，错误被返回给前端后：
- Dict Modal 显示错误 dict 而非正常响应数据
- Token 用量显示为 0
- 复制/填入按钮失效

**修复**：在 `_save_message` 中加 `None` → `''` 转换：

```python
safe_content = message['content'] if message['content'] is not None else ''
```

**前端配合修复**：
1. `success=false` 时隐藏 dict 按钮（`if (_success)` 守卫）
2. `success=false` 时不传 `_raw` 给 meta
3. `success=false` 时给气泡添加 `msg-error` 类

影响文件：`ai_agent/sessions/session_manager.py`、`webui/static/pages/core.js`。
