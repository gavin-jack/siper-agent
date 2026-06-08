# conversation_history 重复用户消息 bug

## 症状
- 对话正常，但 LLM 偶尔返回空响应或奇怪结果
- 通过 `/tmp/llm_payload_latest.json` 检查发现同一用户消息在 messages 数组中出现两次（连续的两个 user 角色消息）

## 根因
`agent.py` `process_message` 方法的执行顺序：
1. 第 263 行：`self.conversation_history.append(user_message)` — 先将用户消息追加到 history
2. 第 268 行：`context = await self._build_context(message, session_id)` — 然后构建 context
3. `_build_context` 第 365 行：`recent_history = self.conversation_history[-20:]` — 取最近 history（包含刚追加的 user）
4. `_build_context` 第 393 行：`context.append({'role': 'user', 'content': user_content})` — 又追加一次 user

结果：context 中同一用户消息出现两次（一次来自 history，一次来自 `_build_context` 追加）。

## 影响
- 简单对话：API 通常能容忍重复，不报错
- 工具调用后的 follow-up：重复 user 消息 + assistant(content+tool_calls) 叠加，触发 LongCat API 返回空响应

## 修复
将 `conversation_history.append(user_message)` 移到 `_build_context` **之后**执行：

```python
# Build context first (includes multimodal user content processing)
context = await self._build_context(message, session_id)
# Then append user message to history (after context is built)
self.conversation_history.append(user_message)
```

`_build_context` 内部仍保留用户消息追加和 `_build_user_content` 调用（处理多模态图片引用）。这样 context 中的 user 消息来自 `_build_context` 的一次性追加，history 中的 user 消息在 context 构建完成后写入，不会重复。

## 验证
修复后，通过 payload 检查文件确认 context 中用户消息只出现一次：
```python
# 在 _build_payload 返回前添加临时调试
import json as _json
with open("/tmp/llm_payload_latest.json", "w") as _f:
    _f.write(_json.dumps(payload, ensure_ascii=False, indent=2, default=str))
```
