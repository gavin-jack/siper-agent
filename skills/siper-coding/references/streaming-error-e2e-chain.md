# 流式 LLM 错误端到端链路

## 完整错误传播路径

```
llm_client.py (HTTP 429/5xx/空响应)
  -> yield {"delta": "[LLM API 错误：...]", "finish_reason": "error"}
    -> agent.py _llm_call (收集 chunk, finish_reason='error')
      -> agent.py process_message (检测 finish_reason='error', 设 success=False)
        -> siper_web.py (is_error = not result['success'] = True)
          -> core.js ws.onmessage (d.type === 'stream_end' && d.is_error)
            -> row.classList.add('error')
            -> avatarWrap.style.display = 'none'
            -> bubble.classList.replace('agent-bubble', 'error')
            -> bubble.style.fontSize = '13px'
            -> _streamCurrentMsgEl.textContent = d.content
              -> CSS: .msg.error { background:#fde8e8 color:var(--red) ... }
              -> CSS: .msg-row.error { align-self: center }
```

## 关键检查点

| 层级 | 文件 | 检查点 | 失败症状 |
|------|------|--------|---------|
| LLM API | llm_client.py | HTTP 429/5xx 重试 | 直接返回错误，无重试 |
| Agent | agent.py | finish_reason='error' -> success=False | 错误消息显示统计行 |
| Web | siper_web.py | is_error = not success | 错误走正常分支 |
| Frontend JS | core.js | d.is_error 分支 | 错误消息无红底样式 |
| Frontend CSS | style.css | .msg.error / .msg-row.error | 样式不对 |

## 诊断方法

1. **后端日志**：搜索 `LLM API 错误` / `finish_reason=error` / `HTTP 429`
2. **前端 DOM**：检查 bubble 是否有 `error` class，row 是否有 `error` class
3. **WS 消息**：在 core.js ws.onmessage 开头加 `console.log(d.type, d.is_error, d.content)`
4. **MemoryLogHandler**：只捕获 ERROR 级别日志，INFO/DEBUG 日志不显示在日志页
