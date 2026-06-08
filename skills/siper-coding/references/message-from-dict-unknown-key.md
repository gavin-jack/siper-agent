# Message.from_dict() 未知字段崩溃

## 问题

`Message` 类是一个 `@dataclass`，只有固定字段：`message_id`, `role`, `content`, `timestamp`, `session_id`, `metadata`, `tool_name`, `tool_call_id`。

当 `SessionManager.add_message()` 传入 `meta=msg_meta` 时，`ConversationSession.add_message()` 把 `meta` 作为 `**kwargs` 合并到 message dict 中。然后 `SessionManager.add_message()` 调用 `Message.from_dict(message)`，后者用 `cls(**data)` 展开 dict，导致：

```
Message.__init__() got an unexpected keyword argument 'meta'
```

## 根因

`Message.from_dict()` 直接 `cls(**data)`，不做字段过滤。

## 修复

```python
from dataclasses import dataclass, field, fields, asdict

@classmethod
def from_dict(cls, data: Dict) -> 'Message':
    """Create from dictionary, filtering unknown keys."""
    valid_keys = {f.name for f in fields(cls)}
    filtered = {k: v for k, v in data.items() if k in valid_keys}
    return cls(**filtered)
```

## 影响

- `meta` 字段被 `from_dict` 静默忽略（不存入 Message 对象）
- 但 `meta` 仍然通过 `_save_message()` 存入数据库（独立 INSERT 语句）
- 读取时通过 `api_get_session_messages()` 的 JSON 解析恢复

## 相关代码

- `ai_agent/sessions/session_manager.py` — `Message.from_dict()` + `_save_message()`
- `ai_agent/core/agent.py` — `msg_meta` 构建（含 usage/tool_calls/skills）
- `siper_web.py` — `api_get_session_messages()` 返回 meta JSON

## 诊断

SiPer 回复 "Message.__init__() got an unexpected keyword argument 'meta'" = 此 bug。
