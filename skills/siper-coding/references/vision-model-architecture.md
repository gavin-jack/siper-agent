# 图片识别视觉模型架构

## 概述

Siper 使用双模型架构处理图片识别：
- **主 LLM**：LongCat-2.0-Preview（不支持多模态图片输入）
- **视觉模型**：sensenova-6.7-flash-lite（支持多模态，通过独立 API 端点）

## 架构流程

```
用户上传图片 → 前端 base64 编码 → WS 发送 {type:"message", images:[{data, mime, name}]}
    ↓
后端 _process_ws_message 保存图片到 /tmp/siper_uploads/
    ↓
构建 effective_text = "用户消息\n[Image: /tmp/siper_uploads/img.png]"
    ↓
agent.process_message(effective_text) → _build_context → _build_user_content
    ↓
_build_user_content 检测到 [Image: /path] 引用
    ↓
如果 vision_client 存在 → _describe_images_with_vision()
    ↓
读取图片文件 → base64 编码 → 调用 sensenova API
    ↓
sensenova 返回 reasoning 字段（非标准 content 字段）
    ↓
提取描述文本 → 拼接到用户消息中
    ↓
LLM 处理增强后的消息
```

## 关键配置

vision_client 在 siper_web.py 的 main() 中通过 configure_llm() 的三个可选参数配置：
- `vision_api_key`: sensenova API key
- `vision_base_url`: `https://token.sensenova.cn/v1`
- `vision_model`: `sensenova-6.7-flash-lite`

三个 configure_llm 调用点（config.json 有模型/config.json 无模型/无 config.json）都需要传 vision 参数。

## sensenova API 特性

- **响应格式**：使用 `reasoning` 字段而非标准 OpenAI 的 `content` 字段。llm_client.py 的 chat_completion 已通过 `message.get("content") or message.get("reasoning") or ""` 兼容。
- **多模态支持**：通过标准 OpenAI 多模态消息格式（content 为数组，含 text 和 image_url）发送图片。
- **图片格式**：支持 PNG、JPEG、GIF、WEBP（通过 magic bytes 验证）。

## LongCat 多模态行为

LongCat-2.0-Preview **接受**多模态格式的请求（不报 4xx 错误），但**不真正理解图片内容**。它会回复类似"无法查看您上传的图片"或"请用文字描述图片"。因此不能依赖 LongCat 处理图片，必须配置独立的视觉模型。

## 错误处理

- 视觉 API 超时（60s）：返回 `[图片: path - 分析超时]`
- 视觉 API 报错：返回 `[图片: path - 分析失败: error]`
- 图片文件不存在：返回 `[图片: path - 文件不存在]`
- 所有错误都被捕获，不会导致消息处理失败，LLM 仍会收到含错误提示的消息

## 安全注意事项

- 图片保存到 `/tmp/siper_uploads/`（临时目录，系统重启自动清理）
- 图片文件通过 magic bytes 验证（防止伪造扩展名）
- 文件名经过清理（正则替换非 `[\w\-.]` 字符）
- 视觉 API 调用有 60s 超时保护

## 故障排查

1. **图片发送后 AI 回复"无法查看图片"**：vision_client 未配置或 sensenova API 不可达。检查日志中是否有 `视觉模型已配置` 消息。
2. **图片发送后无响应/超时**：sensenova API 响应慢，等待最多 60s。检查网络连通性。
3. **服务重启后图片识别失效**：检查是否有旧进程占用端口导致新进程使用旧代码。清理 __pycache__ 后重启。
4. **sensenova 返回空描述**：检查 reasoning 字段是否被正确提取。llm_client.py 需要同时支持 content 和 reasoning 字段。
