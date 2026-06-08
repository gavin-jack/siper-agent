# Tool Call XML 显示到消息内容中的问题

## 现象

SiPer 消息回复中显示原始工具调用 XML 标签：
```
<longcat_tool_call>execute_command
<longcat_arg_key>command</longcat_arg_key>
<longcat_arg_value>ls /opt/searxng/searx/ | head -30</longcat_arg_value>
</longcat_tool_call>
```

## 数据流

```
LLM 响应 → _stream_inner() → delta.content → _send_stream_delta() → WebSocket → 前端渲染
              ↓
         delta.tool_calls 单独收集（应分离）
```

## 可能原因

1. **LLM 输出格式问题**：某些模型（尤其是非 OpenAI 兼容的）可能将工具调用 XML 混入 `content` 字段而非 `tool_calls` 字段
2. **前端渲染未过滤**：`core.js` 或 `page-chat.js` 中渲染 `stream_delta` 时未过滤 XML 标签
3. **agent.py 处理问题**：`process_message()` 可能将工具调用 XML 回传到了 `content`

## 检查方向

| 位置 | 检查内容 |
|------|----------|
| `llm_client.py` | `delta_content` 是否纯净（不含 XML） |
| `agent.py` | `process_message` 的 `stream_callback` 传递逻辑 |
| `core.js` / `page-chat.js` | `stream_delta` 渲染时是否过滤 XML 标签 |
| 模型配置 | 当前使用的模型是否支持原生 tool_calls 协议 |

## 临时修复方案（前端过滤）

在 `core.js` 的 `stream_delta` 渲染前过滤 XML 标签：

```javascript
function filterToolCallXML(text) {
  return text.replace(/<longcat_[^>]*>[\s\S]*?<\/longcat_[^>]*>/g, '')
             .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
             .replace(/<execute_command>[\s\S]*?<\/execute_command>/g, '');
}

// 在渲染 delta 前调用
const cleanText = filterToolCallXML(delta_text);
```

## 根本修复方向

检查 `agent.py` 中 `process_message` 方法：
- `_handle_tool_calls` 执行工具后的返回值是否被正确分离
- `stream_callback` 是否只接收纯文本 delta
- assistant_message 保存时是否混淆了 content 和 tool_calls

## 参考

- `llm_client.py` 第 218-254 行：tool_calls 收集逻辑
- `llm_client.py` 第 288-303 行：最终 tool_calls 构建
- `siper_web.py` 第 1986-1997 行：`_send_tool_progress` 回调
- `siper_web.py` 第 2005 行：`tool_call_callback` 传递
- `agent.py` 第 320 行：`assistant_message` 保存（需检查 content+tool_calls 冲突）
