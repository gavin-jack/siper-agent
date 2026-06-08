# 模型能力检测 — 仅依赖 API 结构化数据

## 原则（2026-08-04 更新）
**禁止通过模型名称字符串匹配推断能力。** 名称推断不可靠（如 `audio` 在 modality 中指输入而非 TTS 输出）。

## 保留的数据源（按优先级）

### 1. OpenAI-style capabilities dict
`model.capabilities = {"image": true, "reasoning": true, ...}`
直接检查布尔值。

### 2. Ollama-style details.capabilities list
`model.details.capabilities = ["vision", "tools"]`
列表包含匹配。

### 3. OpenRouter-style architecture.modality
`model.architecture.modality = "text+image->text"`
- `image` in modality → vision
- `embedding` in modality → embedding
- ~~`audio` in modality → tts~~（已删除：audio 指 ASR 输入，非 TTS 输出）

### 4. SenseNova-style model_type / tasks
- `model.model_type = "tts"` → 仅精确匹配 `tts` / `text_to_speech`
- `model.tasks = ["chat", "tts"]` → 同上
- 已移除 `audio`/`speech`/`voice` 等非精确关键词

## 已删除的名称推断（Step 7-9）
- `name_lower` 匹配 `dall-e`/`stable-diffusion`/`flux` → image_gen
- `name_lower` 匹配 `embedding`/`embed` → embedding
- `name_lower` 匹配 `tts`/`whisper`/`speech-` → tts
- `base_url` 包含 `tts`/`audio`/`speech` → tts

## api_test_model 探测能力（保留）
实际发送请求探测：reasoning/code/vision/function_calling/long_context。
这些是行为探测，不是名称推断，保留。

## 相关文件
- `siper_web.py` — `api_discover_models()` 和 `api_test_model()`
