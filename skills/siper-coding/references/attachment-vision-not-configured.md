# 附件图片 LLM 识别失败 — vision_client 未配置

**发现日期**: 2026-08-03
**状态**: 已诊断 + 前端已修复（commit 669cd41），后端待解决

## 症状

用户发送图片附件后，LLM 回复中没有识别到图片内容。

## 根因链

1. 前端上传链路正常：FileReader → /api/upload → 保存到 uploads/ → WS images 字段 → [Image: /path] 文本引用
2. 后端 _build_user_content() 检测到 [Image: /path]：
   - vision_client 存在 → 用视觉模型描述图片
   - vision_client 为 None → fallback 为 base64 data URL 发给主 LLM
3. 问题：SENSENOVA_API_KEY 未设置 → vision_client=None → LongCat-2.0-Preview 不支持多模态，忽略图片

## 已实现的解决方案

### 前端：模型能力检查 + 警告弹窗（v20260803s+）

在 `page-chat.js` 的 `sendMessage()` 中，上传图片前检查当前模型的 `capabilities` 是否包含 `vision`：

- 有 vision 能力 → 正常发送
- 无 vision 能力 → 重置 `isSending` 状态，弹窗提示
  - 有 vision 模型可切换 → 列出模型列表，点击自动切换并重发
  - 无 vision 模型 → 提示用户去「模型管理」配置

详见 `references/frontend-model-capability-check.md`。

### 后端：待解决

根本解决方案需要以下之一：
- 方案 A：配置 SENSENOVA_API_KEY 环境变量
- 方案 B：修改代码让附件通过 vision_analyze 工具处理
- 方案 C：models.json 中 LongCat-2.0-Preview 的 capabilities 移除 `vision`（如果实际不支持）

## 相关文件

- agent.py: _build_user_content() (line 552+)
- siper_web.py: _process_ws_message() (line 2682+), _sv_key (line 377)
- page-chat.js: uploadFiles() (line 700+), sendMessage() (line 612+), showVisionWarningModal() (line 612+)
- core.js: i18n LANG 对象 (zh:425, en:835, tw:1244)
