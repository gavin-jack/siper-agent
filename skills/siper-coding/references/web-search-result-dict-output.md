# web_search 结果 Dict 直接输出到对话

## 问题现象

用户看到 SiPer 回复中直接出现 Python dict 字符串：

```
{'title': 'FDA approves cemiplimab-rwlc for adjuvant treatment of ...', 'url': 'https://www.fda.gov/...', 'snippet': ''}
{'title': 'Libtayo (cemiplimab-rwlc) FDA Approval History - Drugs.com', 'url': 'https://www.drugs.com/...', 'snippet': ''}
```

## 根因

`agent.py` 的 `_format_tool_result()` 对 list 类型数据用 `str(item)` 转换。当 item 是搜索结果的 dict 时，`str()` 输出 Python dict 字面量字符串。

这个字符串被存入 `step['result']`，追加到 conversation history 的 tool message content 中。LLM 在生成回复时可能直接引用了这个字符串。

## 数据流

```
web_search_tool.execute() → ToolResult(data=[{'title':..., 'url':..., 'snippet':...}, ...])
    ↓
agent._format_tool_result(result)
    ↓ (旧代码)
"\n".join(str(item) for item in result.data[:5])
    ↓
"{'title': '...', 'url': '...', 'snippet': ''}\n{'title': '...', ...}"
    ↓
conversation_history.append({'role': 'tool', 'content': 上面的字符串, ...})
    ↓
LLM 在回复中直接引用了 dict 字符串
```

## 修复方案

在 `_format_tool_result()` 中检测 list item 是否为搜索结果 dict（含 `title` 键），如果是则格式化为易读的 bullet list：

```python
def _format_tool_result(self, result: ToolResult) -> str:
    if result.success:
        if isinstance(result.data, list):
            lines = []
            for item in result.data[:5]:
                if isinstance(item, dict) and 'title' in item:
                    title = item.get('title', '')
                    url = item.get('url', '')
                    snippet = item.get('snippet', '')
                    line = f"• {title}"
                    if url:
                        line += f"\n  {url}"
                    if snippet:
                        line += f"\n  {snippet}"
                    lines.append(line)
                else:
                    lines.append(str(item))
            return "\n".join(lines)
        return str(result.data)
    else:
        return f"Error: {result.error}"
```

## 修复效果

修复后 tool message content 变为：

```
• FDA approves cemiplimab-rwlc for adjuvant treatment of ...
  https://www.fda.gov/...
• Libtayo (cemiplimab-rwlc) FDA Approval History - Drugs.com
  https://www.drugs.com/...
```

LLM 更可能总结/引用这些格式化后的文本，而不是直接输出 dict 字符串。

## 诊断方法

1. 用户报告回复中出现 `{'title':...` 格式的文本
2. 检查 `_format_tool_result()` 是否对 list[dict] 做了特殊处理
3. 检查 `web_search_tool.py` 返回的 data 结构（确认是 list[dict]）

## 注意事项

- 此修复仅改善 LLM **看到**的格式，不强制 LLM 如何回复
- LLM 仍可能选择直接引用工具结果中的文本
- 如果 LLM 仍然输出 dict 字符串，可能需要检查是否有其他路径绕过了 `_format_tool_result()`
