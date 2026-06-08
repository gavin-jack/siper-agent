# skills_active 字段缺失 Bug（v0.9.65）

## 现象

前端消息 meta 区域显示 `🧩 skills × 0`，但实际有技能被激活（如 siper-coding、obsidian 等）。

## 根因

`agent.py` 中 `result = {...}` 字典缺少 `'skills_active': skills_active` 字段。

`skills_active` 在 `agent.py:313` 通过 `list(self.active_skills.keys())` 获取，并传给 LLM 调用（`agent.py:319`），但**没有放入返回的 result 字典**。

前端 `appendMeta()` 读取 `meta.skills_active` 时为 undefined，`(meta.skills_active && meta.skills_active.length) || 0` 返回 0。

## 影响范围

- `agent.py:389-398` — 正常返回的 result（缺少 `skills_active`）
- `agent.py:408-415` — 异常返回的 result（缺少 `skills_active` 和 `processing_time_ms`）
- `siper_web.py:2452-2460` — WS 消息处理异常返回的 result（缺少 `skills_active`）

## 修复方案

```python
# agent.py 正常 result（第 389 行）
result = {
    'response': response_content,
    'session_id': session_id,
    'tool_calls_executed': len(tool_results),
    'tool_call_steps': tool_results,
    'processing_time_ms': processing_time * 1000,
    'skills_active': skills_active,  # ← 新增
    'success': not is_llm_error,
    'usage': usage,
    'prompt_context': ...,
}

# agent.py 异常 result（第 408 行）
return {
    'response': "...",
    'session_id': session_id,
    'error': str(e),
    'success': False,
    'usage': {},
    'tool_call_steps': [],
    'skills_active': [],       # ← 新增
    'processing_time_ms': 0,   # ← 新增
}

# siper_web.py 异常 result（第 2452 行）
result = {
    "success": False,
    "response": str(e),
    "usage": {},
    "tool_calls_executed": 0,
    "tool_call_steps": [],
    "skills_active": [],       # ← 新增
    "processing_time_ms": 0,
    "prompt_context": "",
}
```

## 诊断方法

1. 检查 meta 显示：`document.querySelector('.msg-meta-text').textContent` 包含 `skills × 0`
2. 检查后端数据：`curl -s http://127.0.0.1:9724/api/config` 不直接暴露 skills_active
3. 最可靠方法：在 `stream_end` 处理中 `console.log(_data)` 查看是否有 `skills_active` 字段
4. 如果 `_data.skills_active` 为 undefined，说明后端未发送该字段

## 关联文件

- `ai_agent/core/agent.py:313` — skills_active 获取
- `ai_agent/core/agent.py:389-398` — 正常 result（修复位置）
- `ai_agent/core/agent.py:408-415` — 异常 result（修复位置）
- `siper_web.py:2452-2460` — WS 异常 result（修复位置）
- `webui/static/pages/page-chat.js:352-354` — 前端读取 skills_active

## 教训

**result 字典字段完整性检查**：当新增了一个数据源（如 `skills_active`）并将其传给 LLM 调用时，必须同步检查所有返回 result 的地方（正常、异常、WS 异常）是否都包含了该字段。遗漏任何一处都会导致前端显示异常。
