# Tool 调用准确性验证方法

## 验证流程

### 1. Tool Schema 合规性检查

创建验证脚本（写到 .py 文件，不能用 `python3 -c`），检查：
- 每个工具的 JSON Schema 有 `type: object`、`properties`、`required`
- 每个属性有 `type` 和 `description`
- 函数名符合 OpenAI 规范 `^[a-zA-Z0-9_-]{1,64}`
- 函数描述非空
- `toolsets` 引用在 `toolsets.py` 的 `TOOLSETS` dict 中存在

```python
from ai_agent.tools.tool_registry import ToolRegistry
from ai_agent.tools.toolsets import TOOLSETS

registry = ToolRegistry()
await registry.initialize()
tools = registry.get_available_tools()

# 检查 toolset 引用
for t in tools:
    for ts in t.get('toolsets', []):
        if ts not in TOOLSETS:
            errors.append(f"[{t['name']}] references non-existent toolset '{ts}'")
```

### 2. Toolset 一致性检查

**常见陷阱**：工具注册时引用了 `"core"` toolset，但 `toolsets.py` 的 `TOOLSETS` dict 中没有 `"core"` 定义。

修复：在 `TOOLSETS` 中添加：
```python
"core": {
    "description": "Core tools — file ops, terminal, memory, skills, planning",
    "tools": [],
    "includes": ["file", "terminal", "memory", "skills", "planning", "communication", "vision"],
},
```

### 3. LLM Payload 结构验证

在 `llm_client.py` 的 `_build_payload` 方法中添加临时调试代码，捕获实际发送给 LLM 的消息：

```python
# DEBUG: capture payload for validation
import json as _json, os as _os
try:
    _os.makedirs("/tmp/siper_debug", exist_ok=True)
    with open("/tmp/siper_debug/payload_latest.json", "w") as _f:
        _json.dump(payload, _f, ensure_ascii=False, indent=2, default=str)
except Exception:
    pass
```

**读取时注意**：文件可能正在写入中，需要重试：
```python
def read_payload_safe(path, retries=5, delay=1):
    for i in range(retries):
        try:
            with open(path) as f:
                content = f.read().strip()
            if not content:
                time.sleep(delay)
                continue
            return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            time.sleep(delay)
            continue
    return None
```

### 4. OpenAI 消息结构合规性检查

验证 payload 中的消息：
- `assistant` 消息有 `tool_calls` 时，`content` 必须为 `null`（不能是空字符串或文本）
- `assistant` 消息有文本 `content` 时，不能有 `tool_calls`
- `tool` 消息必须有 `tool_call_id` 和非空 `content`
- 无连续重复的 `user` 消息
- `tool_calls.function.arguments` 是 JSON 字符串（不是 dict）
- `tool_call_id` 与对应 assistant 消息中的 `tool_calls[].id` 匹配

### 5. 端到端 WS 测试

通过 WebSocket 发送多轮对话（含工具调用），验证：
- 工具调用成功执行
- follow-up 对话不报 "Expecting value" 错误
- 20 轮混合对话全部通过

```python
async with websockets.connect("ws://127.0.0.1:9725", max_size=10*1024*1024) as ws:
    await ws.send(json.dumps({
        "type": "message",
        "content": "列出 /tmp 目录下的文件",
        "session_id": "test_session",
    }))
    # Wait for stream_end...
```

## 已知非问题

- `web_search` tool 在 toolset 中注册但运行时不可见：该工具有 `check_fn` 检查 SearXNG 可用性，属于正确的运行时过滤
- `conversation_history` 跨会话共享：设计行为，用于保持对话连续性
- 偶发超时（120s）：LLM 响应慢，重试后通常通过，不是结构性问题
