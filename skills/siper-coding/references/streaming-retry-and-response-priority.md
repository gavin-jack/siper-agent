# Streaming Retry and Response Priority Pattern

## Problem 1: Streaming Retry Too Slow

When SSE connection returns empty stream (0 chunks), `llm_client.py` retries 3 times with exponential backoff (1s, 2s, 4s = 7s total). User perceives this as "stuck".

**Fix**: Reduce to 2 retries with fixed 1s delay:
```python
for attempt in range(2):  # was 3
    if attempt > 0:
        delay = 1  # was 2**(attempt-1)
```

## Problem 2: Frontend stream_end Rendering Incomplete

When LLM calls tools, `_streamAcc` only contains prefix text (e.g., "让我先查看..."). After tool execution, if follow-up LLM's content was sent via streaming but `_streamAcc` doesn't capture it properly, the final rendered message shows only the prefix.

**Fix**: In `core.js`, `stream_end` handler should use `response` field (complete backend response) as primary, `_streamAcc` as fallback:

```javascript
const _finalText = _data.response || _streamAcc;
```

## Problem 3: Last Round Tool Calls

When `_current_tool_round == _MAX_TOOL_ROUNDS - 1`, LLM may still return `tool_calls` instead of a text response. The loop exits and `_generate_final_response()` produces a tool summary instead of the LLM's answer.

**Fix**: Don't pass tools on the last round:
```python
is_last_round = _current_tool_round >= _MAX_TOOL_ROUNDS - 1
followup_tools = None if is_last_round else self.tool_registry.get_available_tools()
```

This forces the LLM to generate a text response on the final round.

## Problem 4: Bubble Text vs Dict Mismatch (v0.9.87z4+)

**Symptom**: In streaming + tool_calls mode, the bubble shows text from the first LLM call (e.g. "Let me search...") prepended to the final response, but the dict modal's `response` field only contains the final response from the second LLM call.

**Root cause**: When LLM returns tool_calls, the first call's streamed text is accumulated in `_streamAcc`. After tool execution, the second LLM call's text is appended to the same `_streamAcc`. But `result['response']` only contains the second call's output.

**Fix**: Clear `_streamAcc` when `tool_progress (running)` arrives — this is the signal that tool execution is starting and the first LLM call's text should be discarded:

```javascript
} else if (d.type === 'tool_progress') {
    // Clear any streamed text from the first LLM call when tool execution starts,
    // so that only the final response after tool execution is shown in the bubble.
    if (d.status === 'running') {
      _streamAcc = '';
      if (_streamBubble) _streamBubble.textContent = '';
    }
    // ... rest of tool_progress handling
}
```

**Timeline**:
```
LLM 1st call → stream_delta("Let me...") → _streamAcc = "Let me..."
LLM outputs tool_calls
_handle_tool_calls starts
  → tool_progress(running) → clear _streamAcc = ""
  → execute tools
LLM 2nd call → stream_delta("Final answer...") → _streamAcc = "Final answer..."
stream_end → dict.response = "Final answer..." ✅ bubble and dict match
```

**Edge cases**:
- If first LLM call only outputs tool_calls (no preceding text), clearing is a no-op
- If no tool_calls (pure text response), no tool_progress is sent, _streamAcc is never cleared — correct behavior
- Multi-round tool calls: each round sends tool_progress, clearing happens each time — correct

**git commit**: `5e295d7`
