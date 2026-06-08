# max_tokens 截断问题诊断与修复

## 症状

- LLM 回复只说一半，用户需要手动要求"继续"才能获得完整内容
- 回复在句子中间突然截断
- 流式响应的 `stream_end` 之后内容不完整

## 根因

`llm_client.py` 中 `max_tokens` 硬编码为 `2048`，而 `agent.py` 的 `_llm_call` 调用时从不传 `max_tokens` 参数。配置文件 `config.json` 中即使设了更大的值（如 `20000`），也从未被读取。

当 LLM 回复超过 `max_tokens` 时，API 返回 `finish_reason: "length"`，内容被截断。代码不检查此标记，直接将截断内容作为完整回复返回。

## 诊断步骤

1. 检查 `llm_client.py` 的 `__init__` 中 `max_tokens` 默认值
2. 检查 `_build_payload`、`chat_completion`、`chat_completion_stream` 的 `max_tokens` 默认值
3. 检查 `agent.py` 的 `_llm_call` 是否传入 `max_tokens`
4. 检查是否有 `finish_reason == "length"` 的检测逻辑
5. 验证：发送一个要求长回复的请求，观察是否被截断

## 修复方案

### 1. 提升 max_tokens 默认值

`llm_client.py` 中：
- `__init__` 新增 `max_tokens` 参数，默认 `8192`
- `_build_payload` 默认值改为 `0`，运行时回退到 `self.max_tokens`
- `chat_completion` 和 `chat_completion_stream` 的 `max_tokens` 默认值同步改为 `0`

### 2. 添加截断检测

`agent.py` 的 `_llm_call` 中：
- 流式路径：检测 `collected_finish == 'length'`，追加截断提示
- 非流式路径：检测 `result['finish_reason'] == 'length'`，追加截断提示

截断提示：`[回复因长度限制被截断，如需完整内容请要求继续]`

## 注意事项

- `max_tokens` 是 completion tokens 上限，不是总 tokens
- `8192` 是合理平衡值，可根据模型 context window 调整
- 如果模型 context window 较小（如 4096），`max_tokens` 应设为 context window 的 ~50%
