# Dict Modal 数据流完整架构

## 概述

Dict Modal（`{}` 按钮）用于查看 agent 响应的完整数据（usage、tool_calls、skills 等）。数据来自两个路径：**流式新消息**和**历史消息加载**。

## 路径对比

### 路径 A：流式新消息（stream_end）

```
后端 siper_web.py
  → WS { type: "stream_end", data: result }
    → core.js onmessage[d.type === 'stream_end']
      → _data = d.data || {}
      → 构建 actions-below（📋 复制 / ↩ 填入 / {} 查看 dict）
      → dictBtn.onclick → showDictModal(_data)
```

关键变量：
- `_data` = `d.data`（完整的 result 字典，含 usage/tool_calls/skills_active 等）
- `showDictModal()` 定义在 `core.js` 第 2025 行
- `{}` 按钮条件：**无条件显示**（stream_end 时始终创建）

### 路径 B：历史消息加载（page-sessions.js）

```
后端 siper_web.py
  → GET /api/sessions/<sid>
    → api_get_session_messages(sid)
      → 从 DB 读取 messages（含 meta JSON 字段）
      → 返回 { messages: [{ role, content, timestamp, meta }] }
        → page-sessions.js loadSessionHistory()
          → addMsg(content, role, meta)  // meta = { _raw: m.meta }
            → page-chat.js addMsg()
              → buildActions(below)
                → dictBtn 条件：isAgent && meta && meta._raw
```

关键变量：
- `m.meta` = DB 中 messages 表的 meta 字段（JSON 字符串，反序列化为对象）
- `meta._raw` = 完整的 response data（usage/tool_calls/skills_active/processing_time_ms/success）
- `{}` 按钮条件：**需要 `meta._raw` 存在**

## 后端数据存储

### messages 表结构（v0.9.87d+）

```sql
CREATE TABLE messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    tool_name TEXT,
    tool_call_id TEXT,
    meta TEXT DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
```

### meta 字段内容

```json
{
    "usage": { "prompt_tokens": 1234, "completion_tokens": 567, "total_tokens": 1801 },
    "tool_calls_executed": 2,
    "tool_call_steps": [...],
    "skills_active": ["siper-coding"],
    "processing_time_ms": 3200,
    "success": true
}
```

### 存储时机

`agent.py` 中 assistant 消息存储时传入 `meta=` 参数：

```python
msg_meta = {
    'usage': usage,
    'tool_calls_executed': len(tool_results),
    'tool_call_steps': tool_results,
    'skills_active': skills_active,
    'processing_time_ms': processing_time * 1000,
    'success': not is_llm_error,
}
await self.session_manager.add_message(session_id, 'assistant', response_content, meta=msg_meta)
```

`session_manager.py` 中 `_save_message()` 序列化 meta 为 JSON 存储。

## 常见问题

### Q: 历史消息没有 {} 按钮

**原因**：messages 表的 meta 字段为空（旧数据没有存储 meta）。

**诊断**：
```javascript
fetch('/api/sessions/' + currentSession).then(r => r.json()).then(d => {
    d.messages.forEach(m => console.log(m.role, m.meta ? 'has meta' : 'no meta'));
});
```

**修复**：新消息会自动存储 meta。旧消息无 meta 时不显示 {} 按钮（不影响功能）。

### Q: 新消息也没有 {} 按钮

**原因**：`stream_end` 处理中 `_streamRow` 或 `_streamBubbleWrap` 为 null。

**诊断**：检查 `core.js` 中 `stream_end` 的 `if (_streamRow && _streamBubbleWrap)` 条件。

### Q: 点击 {} 按钮弹窗不显示

**原因**：`showDictModal()` 未定义或 CSS 类 `.dict-modal-overlay` 未加载。

**诊断**：
```javascript
typeof showDictModal === 'function'  // 应为 true
document.querySelector('.dict-modal-overlay')  // 应为 null（未显示时）
```

## 相关文件

| 文件 | 职责 |
|------|------|
| `siper_web.py` | stream_end 发送 result / api_get_session_messages 返回 meta |
| `ai_agent/core/agent.py` | 构建 msg_meta 并传给 add_message |
| `ai_agent/sessions/session_manager.py` | _save_message 序列化 meta / CREATE TABLE 含 meta 字段 |
| `webui/static/pages/core.js` | stream_end 构建 dict 按钮 / showDictModal() 定义 |
| `webui/static/pages/page-chat.js` | addMsg() buildActions() 中 dict 按钮条件渲染 |
| `webui/static/pages/page-sessions.js` | loadHistory() 传递 meta._raw 给 addMsg |

## ⚠️ Dict Modal 初始渲染与默认 Tab 不匹配（v20260804d+）

**问题**：当修改 `showDictModal()` 添加多 tab（如"回复内容"、"处理结果"、"LLM 原始响应"）并改变默认 tab 时，初始渲染代码 `pre.appendChild(renderFormatted(data))` 仍然渲染完整的 data 对象，而不是默认 tab 对应的内容。

**根因**：初始渲染在 tabBar 创建之后、`setActiveTab()` 调用之前执行，此时 `activeTab` 已设为 'response'，但 `pre` 内容是用旧的 `renderFormatted(data)` 填充的。

**修复**：初始渲染时检查默认 tab，如果是 'response' tab 且有回复内容，直接渲染回复文本而非完整 data 对象：

```js
// 初始渲染（默认显示回复内容）
if (hasResponse) {
  const respText = data.response || data.content || '';
  const respPre = document.createElement('pre');
  respPre.style.cssText = 'margin:0;padding:0;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:' + C.text + ';';
  respPre.textContent = respText;
  pre.appendChild(respPre);
} else {
  pre.appendChild(renderFormatted(data));
}
```

**教训**：修改 modal 的默认 tab 时，必须同步修改初始渲染逻辑，确保初始内容与默认 tab 一致。
