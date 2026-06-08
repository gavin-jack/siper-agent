# siper_web.py 错误显示链路中的陷阱

## Error: unknown（v0.6.5 修复）

### 现象
前端收到 `Error: unknown` 错误消息。

### 根因
siper_web.py 第 1853 行：
```python
response = result["response"] if result["success"] else f"Error: {result.get('error', 'unknown')}"
```

agent.py 的 `process_message` 正常返回路径（第 295-304 行）中，result 字典**没有 `'error'` 键**：
```python
return {
    'response': response_content,  # 错误时包含 [LLM 返回空响应...] 等描述
    'session_id': session_id,
    'tool_calls_executed': ...,
    'success': not is_llm_error,   # False
    'usage': usage,
    ...
}
```

当 `success=False` 时，`result.get('error', 'unknown')` 取不到 `'error'` 键，fallback 到 `'unknown'`。

### 修复
直接统一用 `result["response"]`，因为 response 字段已经包含完整错误描述：
```python
response = result["response"]
```

### 关键教训
**不要对字典用 `get(key, default)` 来拼接错误消息**。如果上游没有保证该 key 存在，default 值会成为误导性的错误文本。应该直接传递上游已格式化的错误信息，或在 agent.py 中统一添加 `'error'` 键。

## stream_end / response 消息的 is_error 链路

siper_web.py 中 `is_error` 的判断：
```python
is_error = not result.get("success", True)
```

当前端收到 stream_end 或 response 消息时：
- `is_error=True` → 前端用红色错误样式显示 `d.content`
- `is_error=False` → 前端正常显示 agent 气泡

**注意**：`is_error` 和 `d.content` 是独立的。`is_error` 只控制样式，`d.content` 才是实际显示的文本。修复前 `d.content` 可能是 `"Error: unknown"`，样式正确但文本无意义。

## HTML 重复 class 属性（v0.6.5 修复）

### 现象
sessions 页面右侧预览区不显示内容。

### 根因
index.html 中写了两个 class 属性：
```html
<div class="page-body" class="page-body-flex">
```

HTML 规范中，同一属性名出现多次时，**只有第一个有效**，后面的被忽略。所以 `page-body-flex` 类没有生效，flex 布局失效。

### 修复
合并为一个 class 属性：
```html
<div class="page-body page-body-flex">
```

### 排查方法
浏览器 DevTools → Elements → 检查元素的 class 属性，看是否有意外的重复。
