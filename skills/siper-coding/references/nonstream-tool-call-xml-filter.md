# 非流式模式 Tool Call XML 过滤缺失

## 问题描述

SiPer 回复中出现 `<longcat_tool_call>...` 或 `<execute_command>...` 等工具调用 XML 标记，混入用户可见的文本内容中。

## 根因

`llm_client.py` 中的 `_filter_tool_call_xml()` 函数存在，但**仅在流式模式中被调用**：

- ✅ 流式模式：`_stream_inner()` 第 254 行对每个 chunk 的 `delta_content` 调用 `_filter_tool_call_xml()`
- ❌ 非流式模式：`chat_completion()` 在 `_parse_response()` 返回后**未过滤** content 就直接返回

## 修复方案

在 `chat_completion()` 的 `_parse_response()` 调用后，对 `result["content"]` 应用过滤：

```python
result = self._parse_response(message)
# Filter tool call XML from content
result["content"] = _filter_tool_call_xml(result["content"])
```

## `_filter_tool_call_xml()` 过滤规则

```python
def _filter_tool_call_xml(text: str) -> str:
    """Remove tool call XML tags from text content."""
    if not text:
        return text
    text = re.sub(r'<longcat_tool_call>[\s\S]*?</longcat_tool_call>', '', text)
    text = re.sub(r'<execute_command>[\s\S]*?</execute_command>', '', text)
    text = re.sub(r'<\s*>', '', text)  # 空标签
    text = re.sub(r'\n{3,}', '\n\n', text)  # 多余空行
    return text.strip()
```

## 诊断步骤

1. 观察 SiPer 回复中是否出现 `<longcat_tool_call>` 等 XML 标签
2. 检查 `llm_client.py` 中 `_filter_tool_call_xml` 是否在 `chat_completion` 中被调用
3. 检查 `_stream_inner` 中是否已正确过滤（通常已正确）
4. 修复后重启 SiPer 服务验证

## 相关文件

- `ai_agent/core/llm_client.py` — `_filter_tool_call_xml()` 定义 + `chat_completion()` / `_stream_inner()` 调用点
- `webui/static/pages/core.js` — `tool_progress` 分支（不应显示在气泡中）
