# 模型能力探测准确性指南

## 核心原则

**探测结果宁可漏报，不可误报。** 误标能力比不标更糟——用户会切换到一个"据说支持 vision"但实际不支持的模型，导致 LLM 回复"没有看到图片"。

## 各能力探测方法

### vision（视觉）

**三条件必须同时满足：**
1. API 接受请求（不抛异常）
2. `image_tokens > 0`（某些模型如 LongCat 返回 `image_tokens: 0` 表示完全忽略图片）
3. 响应内容非空 + 非回避性回复（如"我没有看到图片"/"I cannot see"）

**测试图：** 16x16 红色方块（比 1x1 PNG 更容易被识别）

**陷阱：**
- LongCat-2.0-Preview：返回 `image_tokens: 0`，完全忽略图片
- SenseNova-6.7-flash-lite：返回 400 "broken PNG file"，不支持多模态
- 某些模型会静默忽略图片但不报错 → 必须检查 image_tokens

### reasoning（推理）

**强信号（任一即可）：**
- `message.reasoning_content` 非空（DeepSeek 风格）
- `message.reasoning` 非空（SenseNova 风格）
- 回复中包含 `<think>` 或 `</think>` 标签

**弱信号（需同时满足）：**
- 包含 ≥3 个推理关键词：step, therefore, because, reasoning, first, second, third, let's think, thinking process, analysis 等
- 回复长度 > 80 字符
- 包含正确答案（如 bat-and-ball 问题的 $0.05）

**陷阱：**
- sensenova-6.7-flash-lite：`message.content` 为 null，`message.reasoning` 有内容。需要 `_extract_message_content()` 合并两个字段
- `max_tokens` 太小会截断 reasoning 内容，导致答案缺失

### code（代码）

**要求：**
- 包含 fenced code block（` ``` `）
- 包含函数结构（`def`/`function`/`class` + `return`）
- 包含 ≥2 个代码关键词

### function_calling（工具调用）

**要求：** API 返回中 `message.tool_calls` 字段非空

### long_context（长上下文）

**方法：** 发送 ~4K tokens 的文本，问一个只有读完全文才能回答的问题

**验证：** `finish_reason == "stop"` + 回答正确

### tts（语音合成）

**方法：** 仅通过模型名称关键词匹配

**关键词：** `tts`, `whisper`, `speech`, `audio`（**不包含** `sensenova`, `sensechat` 等泛化词）

### image_gen（图像生成）

**关键词：** `dall-e`, `dalle`, `flux`, `stable diffusion`, `midjourney`, `image gen`

## 模型特定陷阱

### LongCat-2.0-Preview
- ❌ 不支持多模态（vision）：`image_tokens: 0`
- ✅ 支持 chat, code, function_calling, long_context

### SenseNova-6.7-flash-lite
- ❌ 不支持多模态（vision）：返回 400
- ❌ 不支持 tts：TTS 端点返回 503
- ✅ 支持 reasoning：通过 `message.reasoning` 字段（非标准 `reasoning_content`）
- ⚠️ `message.content` 为 null，只有 `message.reasoning` 有内容

## 代码参考

### _extract_message_content 合并 reasoning 字段

```python
def _extract_message_content(msg_dict):
    content = (msg_dict.get("content") or "").strip()
    reasoning = (msg_dict.get("reasoning") or "").strip()
    if content and reasoning:
        return content + "\n" + reasoning
    return content or reasoning
```

## 验证历史

| 日期 | 模型 | 误判 | 修正 |
|------|------|------|------|
| 2026-08-03 | LongCat-2.0-Preview | 误标 vision | 移除，改为检查 image_tokens |
| 2026-08-05 | sensenova-6.7-flash-lite | 误标 tts | 移除，实际为 reasoning |
