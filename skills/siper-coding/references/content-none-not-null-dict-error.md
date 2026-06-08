# content=None NOT NULL 约束失败 + success=false 前端处理

> 版本：v0.9.87z+ (2026-08-04)
> 涉及文件：`session_manager.py`, `core.js`, `page-chat.js`

## 问题 1：content=None → SQLite NOT NULL 约束失败

### 现象
LLM 返回 tool_calls 时，`agent.py` 调用 `add_message(session_id, 'assistant', None, ...)` 传入 `content=None`，但 `messages.content` 列是 `NOT NULL`，导致 SQLite 报错：
```
NOT NULL constraint failed: messages.content
```

### 根因
`agent.py` 中两处调用传入 `None`：
- `agent.py:867` — tool_calls 阶段的 assistant 消息
- `agent.py:903` — 最终回复前的 assistant 消息

`session_manager.py` 的 `_save_message()` 直接拼接 SQL，未做 None 转换。

### 修复方案（DB 层统一处理）

```python
# session_manager.py _save_message()
safe_content = message['content'] if message['content'] is not None else ''
# 用 safe_content 替代 message['content'] 插入 DB
```

**为什么不在调用层修复**：`add_message()` 接受 `Optional[str]`，多处调用可能传入 None，DB 层统一处理更安全。

## 问题 2：success=false 前端显示错误 dict

### 现象
当 API 返回 `success=false` 时，前端仍然渲染 `{}` 按钮，点击后显示错误 dict（如 `{"success": false, "error": "..."}`），token 用量显示为 0。

### 根因
`core.js` stream_end 处理中未区分 success/false，统一附加 `_raw` meta 和 dict 按钮。

### 修复方案

```javascript
// core.js stream_end
if (d.success) {
  // 只有成功时才附加 _raw 和 dict 按钮
  if (d.data) meta._raw = d.data;
  // ... 正常渲染 meta
} else {
  // 失败时添加 msg-error 类，不渲染 dict 按钮
  if (_streamBubbleWrap) _streamBubbleWrap.classList.add('msg-error');
}
```

```javascript
// dict 按钮渲染条件
if (meta && meta._success !== false) {
  // 渲染 {} 按钮
}
```

```javascript
// _raw 只在成功时附加
if (meta._success === true && d.data) {
  meta._raw = d.data;
}
```

## 问题 3：空气泡（空 content 时 stream_end 跳过渲染）

### 现象
当 LLM 只返回 tool_calls 而无 content 时，stream_end 收到空 content，前端跳过气泡渲染，导致用户看到"空气泡"（有 meta 无内容）。

### 修复
确保即使 content 为空字符串，也正常渲染气泡（至少显示 tool panel）。

## 调试检查清单

1. `session_manager.py` 中 `_save_message()` 有 `None` → `''` 转换
2. `core.js` stream_end 中 `success=false` 时气泡添加 `msg-error` 类
3. `core.js` 中 dict 按钮只在 `_success !== false` 时渲染
4. `core.js` 中 `_raw` 只在 `_success === true` 时附加
5. 错误响应不再显示 dict 按钮和 token 用量

## 相关参考

- `references/session-db-tool-messages-persistence.md` — Session DB tool_calls 持久化
- `references/dict-modal-data-flow.md` — Dict Modal 数据流架构
