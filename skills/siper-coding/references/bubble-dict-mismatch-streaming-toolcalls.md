# 流式+tool_calls 气泡与 Dict 不一致 Bug（v0.9.87z4+）

## 现象

用户点击气泡上的 `{}` 按钮打开 dict modal，发现 `response` 字段的内容与气泡中显示的文字不一致。气泡多出了开头的一段文字（如"Let me search for you..."）。

## 根因

流式 + tool_calls 场景下的时间线：

```
1. 第1次 LLM 调用（streaming）
   → stream_delta("Let me search...") → 前端 _streamAcc = "Let me search..."
   → LLM 输出 tool_calls（delta.content 通常为 ""）

2. _handle_tool_calls 被调用
   → tool_call_callback('web_search', 'running', {})
   → 前端收到 tool_progress(running)

3. 工具执行（web_search 等）

4. 第2次 LLM 调用（streaming，最终回复）
   → stream_delta("最终回复内容...") → 前端 _streamAcc = "Let me search...最终回复内容..."

5. stream_end
   → 气泡显示 _streamAcc = "Let me search...最终回复内容..."
   → dict.response = "最终回复内容..."（只有第2次 LLM 的输出）
   → ❌ 不一致！
```

**核心问题**：`_streamAcc` 是单次会话级别的全局变量，第1次 LLM 调用的文本和第2次 LLM 调用的文本被混合在一起。但后端 `result['response']` 只包含第2次 LLM 的输出（即 `final_response = followup_content`）。

## 修复

在 `tool_progress (running)` 消息到达时清空 `_streamAcc`：

```javascript
} else if (d.type === 'tool_progress') {
    // Clear any streamed text from the first LLM call when tool execution starts
    if (d.status === 'running') {
      _streamAcc = '';
      if (_streamBubble) _streamBubble.textContent = '';
    }
    // ... 其余 tool_progress 处理（显示工具步骤到 #typingTools）
}
```

修复后的时间线：

```
1. 第1次 LLM → _streamAcc = "Let me search..."
2. tool_progress(running) → _streamAcc = ""  ✅ 清空
3. 工具执行
4. 第2次 LLM → _streamAcc = "最终回复内容..."
5. stream_end → 气泡 = "最终回复内容..." = dict.response ✅
```

## 边界情况

| 场景 | 行为 |
|------|------|
| 第1次 LLM 只有 tool_calls（无前置文本） | 清空无影响，_streamAcc 本来就是 "" |
| 纯文本响应（无 tool_calls） | 无 tool_progress，_streamAcc 不清空 ✅ |
| 多轮 tool_calls | 每轮都清空，最终只保留最后一轮的回复 ✅ |
| 第1次 LLM 有文本但也被后端过滤（"让我先"） | 后端 agent.py 已过滤 response_content，但前端的流式文本仍需清空 |

## 关联修复

- `_format_tool_result()` 对 `list[dict]` 格式化为 bullet list（commit `b9e14f3`）— 解决 dict 内容显示问题
- 本修复（commit `5e295d7`）— 解决气泡和 dict 不一致问题

## 诊断方法

1. 用户报告"dict 和气泡内容不一样"
2. 检查是否涉及 tool_calls（看 dict 中的 `tool_call_steps`）
3. 如果 `tool_call_steps.length > 0` 且气泡开头有多余文本 → 此 bug
4. 验证：搜索查询后，气泡开头不应有"Let me search..."等前缀
