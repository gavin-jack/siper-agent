# 模型能力检测 — 仅依赖 API 结构化数据（v0.9.87v+，v0.9.87y SenseNova 扩展）

## 核心原则

**禁止通过模型名称字符串匹配推断能力。** 能力检测仅从 API 返回的结构化数据中提取。

## 已删除的名称推断逻辑

以下逻辑已在 v0.9.87v 中删除：

```python
# ❌ 已删除：Step 7-9 name-based heuristics
name_lower = model.lower()
# image_gen: dalle/stable-diffusion/flux 等关键词匹配
# embedding: embedding/embed 关键词匹配
# tts: tts/whisper/speech-/text-to-speech 关键词匹配
```

原因：模型名称不可靠，不同 provider 命名规范不一致，导致误判。

## 保留的 API 结构化数据推断

`api_discover_models` 中保留以下 4 种 API 返回的结构化数据推断：

| 步骤 | Provider | 数据来源 | 提取方式 |
|------|----------|----------|----------|
| 1 | OpenAI | `model.capabilities: {text, image, tool_call}` | dict key 匹配 |
| 2 | Ollama | `model.details.capabilities: ["vision"]` | list 元素匹配 |
| 3 | OpenRouter | `architecture.modality: "text+image->text"` | modality 字符串匹配 |
| 4 | SenseNova | `model_type: "chat"` / `tasks: ["chat","tts"]` | type/tasks 字段匹配 |

`api_test_model` Step 0 也从 `/models` 端点获取相同结构化数据。

## ⚠️ audio ≠ TTS（重要）

**`audio` 在 modality/type/tasks 中通常指语音输入（ASR），不是 TTS 输出。**

已修复的误映射：
- `architecture.modality` 包含 `"audio"` → ~~`tts`~~（已删除）
- `type_map["tts"]` 关键词：~~`["tts", "audio", "speech", "voice"]`~~ → `["tts", "text_to_speech"]`
- `task_map["tts"]` 关键词：~~`["tts", "audio", "speech", "voice", "text_to_speech"]`~~ → `["tts", "text_to_speech"]`

## SenseNova API 响应格式

```
模型列表 key: "models"（非 "data"）
能力字段: model_type / tasks
```

| Provider | 模型列表 key | 能力字段 |
|----------|-------------|----------|
| OpenAI | `data` | `capabilities: {text, image, tool_call}` |
| Ollama | `data` | `details.capabilities: [vision]` |
| OpenRouter | `data` | `architecture.modality: "text+image->text"` |
| SenseNova | `models` | `model_type: "chat"` 或 `tasks: ["chat","tts"]` |

## 注意事项

- API 无任何能力数据时默认标记 `chat`
- SenseNova 的 `tool_choice` 参数不兼容（HTTP 400），已在 `llm_client.py` 中修复
- `api_test_model` 的推理/代码/视觉/函数调用/long_context 探测保留（主动探测，非名称推断）
