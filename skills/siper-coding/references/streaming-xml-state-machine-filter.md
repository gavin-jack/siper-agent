# Streaming XML State Machine Filter Pattern

## Problem

In streaming mode (`chat_completion_stream`), LLM responses are delivered as small chunks (deltas). Tool call XML tags like `<longcat_tool_call>...</longcat_tool_call>` or `<execute_command>...</execute_command>` may span multiple chunks:

```
Chunk 1: "好的，让我先"
Chunk 2: "<longcat_tool_call>\n"
Chunk 3: "  <longcat_arg_key>path</longcat_arg_key>\n"
Chunk 4: "  <longcat_arg_value>...</longcat_arg_value>\n</longcat_tool_call>"
Chunk 5: " 让我执行这个操作。"
```

Single-chunk filtering (`_filter_tool_call_xml` on each delta) only removes XML that is **complete within one chunk**. Cross-chunk XML leaves incomplete fragments in the final response.

## Solution: State Machine Filter

Implement a state machine in `chat_completion_stream` that tracks XML tag state across chunks:

```python
_xml_state = 0  # 0=normal, 1=in-longcat, 2=in-execute

for item in self._stream_inner(payload):
    if item.get("delta"):
        delta = item["delta"]
        result_parts = []
        pos = 0
        
        while pos < len(delta):
            if _xml_state == 0:
                # Normal: find opening tags
                lc_idx = delta.find('<longcat_tool_call>', pos)
                ec_idx = delta.find('<execute_command>', pos)
                
                if lc_idx == -1 and ec_idx == -1:
                    result_parts.append(delta[pos:])
                    break
                elif lc_idx != -1 and (ec_idx == -1 or lc_idx < ec_idx):
                    if lc_idx > pos:
                        result_parts.append(delta[pos:lc_idx])
                    _xml_state = 1
                    pos = lc_idx + len('<longcat_tool_call>')
                else:
                    if ec_idx > pos:
                        result_parts.append(delta[pos:ec_idx])
                    _xml_state = 2
                    pos = ec_idx + len('<execute_command>')
                    
            elif _xml_state == 1:
                # In <longcat_tool_call>, find closing tag
                close_idx = delta.find('</longcat_tool_call>', pos)
                if close_idx == -1:
                    _xml_buffer = delta[pos:]
                    break
                pos = close_idx + len('</longcat_tool_call>')
                _xml_state = 0
                
            elif _xml_state == 2:
                # In <execute_command>, find closing tag
                close_idx = delta.find('</execute_command>', pos)
                if close_idx == -1:
                    _xml_buffer = delta[pos:]
                    break
                pos = close_idx + len('</execute_command>')
                _xml_state = 0
        
        if result_parts:
            filtered = ''.join(result_parts)
            if filtered:
                yield {**item, "delta": filtered}
    else:
        # Final chunk - flush buffer
        if _xml_buffer:
            _xml_buffer = ""  # Discard incomplete XML
        yield item
```

## Key Points

1. **State tracking**: `_xml_state` persists across chunk iterations
2. **Partial match handling**: When opening tag found but closing tag not in same chunk, buffer remaining content and continue in next chunk
3. **Buffer discard**: Incomplete XML at final chunk is discarded (it's malformed)
4. **Non-delta items**: Final chunk (no delta) triggers buffer flush

## Verification

Test with WebSocket directly (bypass browser cache):

```python
import asyncio, json, websockets

async def test_xml_filter():
    async with websockets.connect("ws://localhost:9725") as ws:
        await ws.recv()  # connected
        await ws.send(json.dumps({
            "type": "message",
            "content": "使用 search_files 查找 /home/gavin/.siper 目录下所有 .py 文件",
            "session_id": "test"
        }))
        
        acc = ""
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "stream_delta":
                acc += msg.get("delta", "")
            elif msg.get("type") == "stream_end":
                assert "<longcat_tool_call>" not in acc, f"XML 残留: {acc[:200]}"
                assert "<execute_command>" not in acc, f"XML 残留: {acc[:200]}"
                print("✓ XML 过滤通过")
                print(f"Content: {acc[:300]}")
                break

asyncio.run(test_xml_filter())
```

## Related Files

- `ai_agent/core/llm_client.py` — `chat_completion_stream` method
- `ai_agent/core/llm_client.py` — `_filter_tool_call_xml` helper (regex-based, for non-streaming)

## See Also

- `nonstream-tool-call-xml-filter.md` — Non-streaming mode filtering
- `tool-progress-display-pattern.md` — Frontend tool progress display
