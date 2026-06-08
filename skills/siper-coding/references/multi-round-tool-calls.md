# Multi-Round Tool Call Support Pattern

## Problem

In `_handle_tool_calls` method, the line `followup_tools = None if _tool_round >= 1` prevented the LLM from making follow-up tool calls after the first round. This caused the agent to return text results immediately after executing one tool, even when the user requested multi-step tasks.

**Symptoms:**
- User asks: "Search for .py files, then read the first one"
- LLM executes `search_files` → returns text result
- LLM never calls `read_file` even though the search results contain file paths

## Root Cause

The original code in `agent.py` line 784:
```python
followup_tools = None if _tool_round >= 1 else self.tool_registry.get_available_tools()
```

This meant:
- Round 0: Tools available → LLM can call tools
- Round 1+: No tools → LLM forced to return text

## Solution

### Step 1: Remove the restriction

Change line 784 in `agent.py`:
```python
# Before:
followup_tools = None if _tool_round >= 1 else self.tool_registry.get_available_tools()

# After:
followup_tools = self.tool_registry.get_available_tools()
```

### Step 2: Implement multi-round loop

Replace the single follow-up call with a loop that continues until:
- LLM returns pure text (no tool_calls), OR
- `_MAX_TOOL_ROUNDS` limit is reached

```python
_MAX_TOOL_ROUNDS = self.config.max_tool_rounds or 100
while _current_tool_round < _MAX_TOOL_ROUNDS:
    followup_tools = self.tool_registry.get_available_tools()
    llm_followup = await self._llm_call(
        messages=extended,
        tools=followup_tools,
        skills=list(self.active_skills.keys()),
        stream_callback=stream_callback,
    )
    followup_tool_calls_result = llm_followup.get('tool_calls')
    
    if followup_tool_calls_result and _current_tool_round < _MAX_TOOL_ROUNDS - 1:
        # Execute new tool calls, append results to extended context
        # Continue loop
        _current_tool_round += 1
    else:
        # No more tool calls or max rounds reached
        final_response = followup_content
        break
```

### Step 3: Verify with WebSocket test

```python
import asyncio, json, websockets

async def test_multi_round():
    async with websockets.connect("ws://localhost:9725") as ws:
        await ws.recv()  # connected
        await ws.send(json.dumps({
            "type": "message",
            "content": "先使用 list_dir 查看 /home/gavin/.siper/webui/static/pages/，然后读取第一个 .js 文件的前 20 行",
            "session_id": "test"
        }))
        
        tool_count = 0
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "tool_progress" and msg.get("status") == "running":
                tool_count += 1
            elif msg.get("type") == "stream_end":
                print(f"Tool calls made: {tool_count}")
                assert tool_count >= 2, f"Expected at least 2 tool calls, got {tool_count}"
                break

asyncio.run(test_multi_round())
```

## Key Points

1. **Infinite loop prevention**: `_MAX_TOOL_ROUNDS` (default 100) prevents infinite tool call loops
2. **Context accumulation**: Each tool result is appended to `extended` context for the next LLM call
3. **Proper tool_call_id matching**: Assistant messages use `content: null` + `tool_calls`, tool messages use matching `tool_call_id`
4. **Stream callback**: `stream_callback` is passed through to show progress during follow-up calls

## Configuration

- `AgentConfig.max_tool_rounds`: Maximum number of tool call rounds (default 100)
- `agents/default/config.json`: Can override `max_tool_rounds` (must match code default)

## Related Files

- `ai_agent/core/agent.py` — `_handle_tool_calls` method
- `ai_agent/core/agent.py` — `process_message` method (entry point with `_MAX_TOOL_ROUNDS`)
- `agents/default/config.json` — Configuration override

## See Also

- `tool-call-validation-method.md` — Tool call compliance checking
- `soul-md-tool-calling-control.md` — System prompt for tool calling behavior
