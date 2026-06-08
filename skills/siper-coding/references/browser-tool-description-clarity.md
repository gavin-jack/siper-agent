# Browser Tool Description Clarity Pattern

## Problem

The `BrowserTool` in `browser_tool.py` listed multiple operations (navigate, snapshot, click, type, scroll, back, press) in its description without clarifying that these are **action parameters** of a single tool, not separate tools.

**Symptoms:**
- LLM reports: "browser_snapshot is not an available tool"
- LLM reports: "browser_click is not an available tool"
- LLM refuses to use browser functionality even when `browser_navigate` is registered

## Root Cause

The tool description said:
```
浏览器自动化工具。支持 navigate(打开URL)、snapshot(获取页面快照)、
click(点击元素)、type(输入文本)、scroll(滚动)、back(后退)、press(按键) 操作。
```

This made the LLM think `browser_snapshot`, `browser_click`, etc. were separate tool names, not `action` parameter values for `browser_navigate`.

## Solution

Update `browser_tool.py` to clearly state:

1. **`browser_navigate` is a SINGLE tool** — not multiple tools
2. **`action` parameter selects the operation** — list all available actions
3. **Required parameters per action** — specify which actions need which parameters
4. **Implementation limitations** — clarify which actions work with urllib vs playwright

### Before (confusing):
```python
description=(
    "浏览器自动化工具。支持 navigate(打开URL)、snapshot(获取页面快照)、"
    "click(点击元素)、type(输入文本)、scroll(滚动)、back(后退)、press(按键) 操作。"
    "navigate 和 snapshot 使用 urllib 实现；click/type/scroll/back/press 需要 playwright 支持。"
)
```

### After (clear):
```python
description=(
    "浏览器自动化工具（单一工具，通过 action 参数选择操作类型）。\n"
    "可用操作：\n"
    "- navigate: 打开URL，需 url 参数\n"
    "- snapshot: 获取页面内容预览，需 url 参数\n"
    "- click: 点击元素，需 ref 参数（需要 playwright）\n"
    "- type: 输入文本，需 ref 和 text 参数（需要 playwright）\n"
    "- scroll: 滚动页面，需 direction 参数（需要 playwright）\n"
    "- back: 后退（需要 playwright）\n"
    "- press: 按键，需 key 参数（需要 playwright）\n"
    "注意：只有 navigate 和 snapshot 可用 urllib 实现，其他操作需要 playwright。"
)
```

## Verification

After updating the description, test with:

```python
import asyncio, json, websockets

async def test_browser_tool():
    async with websockets.connect("ws://localhost:9725") as ws:
        await ws.recv()
        await ws.send(json.dumps({
            "type": "message",
            "content": "请使用 browser_navigate 工具，action 设为 'snapshot'，url 设为 'https://example.com'，获取页面内容。",
            "session_id": "test"
        }))
        
        tool_called = False
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "tool_progress" and msg.get("status") == "running":
                tool_called = True
                print(f"Tool: {msg.get('tool_name')}")
            elif msg.get("type") == "stream_end":
                assert tool_called, "browser_navigate was not called"
                print("✓ Browser tool called correctly")
                break

asyncio.run(test_browser_tool())
```

## Key Points

1. **Single tool, multiple actions**: Always clarify that one tool name supports multiple operations via parameters
2. **Parameter requirements**: List which parameters are required for each action
3. **Implementation notes**: Be explicit about which features are available vs. require additional setup
4. **Schema alignment**: The tool's JSON schema should have `action` as an enum with all available operations

## Related Files

- `ai_agent/tools/browser_tool.py` — BrowserTool class
- `ai_agent/tools/tool_registry.py` — Tool registration

## See Also

- `tool-architecture.md` — Tool registration and schema patterns
- `tool-call-validation-method.md` — Tool call compliance checking
