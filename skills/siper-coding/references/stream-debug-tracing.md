# STREAM_DEBUG: Tracing LLM Streaming Chunk Reception

## When to Use

When LLM appears to return empty responses but the API is actually returning data. Add temporary warning-level logging to `llm_client.py` to trace what chunks are actually received.

## Technique

In `llm_client.py` `chat_completion_stream()`, add a `self.logger.warning()` line after parsing each SSE chunk:

```python
delta = choice.get("delta", {})
self.logger.warning(
    f"STREAM_DEBUG chunk #{chunk_count}: "
    f"delta_keys={list(delta.keys())}, "
    f"content_len={len(delta.get('content') or '')}, "
    f"delta={json.dumps(delta, ensure_ascii=False)[:200]}"
)
```

Use `WARNING` level (not `DEBUG`) because `logging.basicConfig(level=INFO)` in siper_web.py will suppress DEBUG messages.

## What to Look For

- **chunk_count stays at 0**: No valid SSE chunks received — network issue or API returned no `data:` lines
- **All chunks have content_len=0**: API returned SSE stream but all deltas are empty — valid SSE but empty content
- **Chunks have content but agent collected_content is empty**: Bug in agent.py collection logic (`if delta:` filtering out valid deltas)
- **Chunks stop mid-stream**: WSL2 TCP drop or API timeout

## Cleanup

Remove the STREAM_DEBUG line after diagnosis. Never commit it — it generates excessive log noise.

## Session Example (v0.6.13)

Added STREAM_DEBUG to diagnose "连续 3 次返回空响应" error. Discovered:
1. Chunks were arriving correctly (7 chunks with valid content)
2. The real issue was WSL2 WS disconnection preventing messages from reaching siper
3. LLM API was never the problem — curl tests confirmed API returning data normally
