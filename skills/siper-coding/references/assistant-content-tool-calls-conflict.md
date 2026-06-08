# assistant content+tool_calls 叠加冲突

## 症状
- 工具调用成功，follow-up 对话报错：`[LLM API 错误：请求异常] Expecting value: line 1 column 1 (char 0)`
- 第 1 轮工具调用正常，第 2 轮 follow-up 时触发

## 根因
`agent.py` `process_message` 第 315-323 行构建 assistant_message 时：

```python
assistant_message = {
    'role': 'assistant',
    'content': response_content,  # 文本响应（非空）
    'tool_calls': llm_response.get('tool_calls', []),  # ← 原始 LLM 的 tool_calls
    'tool_results': tool_results
}
```

当 LLM 返回 tool_calls 后：
1. `_handle_tool_calls` 执行工具，follow-up LLM 调用返回纯文本
2. `response_content` = 纯文本（非空）
3. `llm_response` 仍是第 1 轮 LLM 的原始响应，包含 `tool_calls`
4. 结果：assistant 消息同时有 `content`（非空文本）和 `tool_calls`

LongCat API **不兼容**这种格式：HTTP 200 但返回空 body（非有效 JSON），OpenAI SDK 解析失败报 JSONDecodeError。

注意：OpenAI 官方 API **允许** assistant 消息同时有 content 和 tool_calls（模型一边说话一边调用工具），但 LongCat 不兼容。

## 修复
只有当没有工具执行结果（直接 LLM 响应）时才包含 tool_calls：

```python
assistant_message = {
    'role': 'assistant',
    'content': response_content,
    'timestamp': datetime.now().isoformat(),
    'session_id': session_id,
    'tool_results': tool_results
}
# Only include tool_calls if this was a direct LLM response
# (not a follow-up after tool execution)
if not tool_results and llm_response.get('tool_calls'):
    assistant_message['tool_calls'] = llm_response['tool_calls']
```

## 触发条件
- 第 1 轮：用户消息 → LLM 返回 tool_calls → `_handle_tool_calls` 执行 → 保存 assistant(text) + tool_calls
- 第 2 轮：`_build_context` 包含第 1 轮的 assistant(content+tool_calls) → LongCat API 返回空响应

## 验证
修复后运行 20 轮混合对话测试（含工具调用和 follow-up），全部通过无报错。
