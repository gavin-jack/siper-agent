# 前端模型能力检查 — 发送附件前校验 vision 能力

**实现日期**: 2026-08-03
**最后更新**: 2026-08-03（补充 models.json 配置不一致教训）
**状态**: 已实现（commit 669cd41, 331aba0）

## 需求背景

用户发送图片附件时，如果当前选择的模型不支持图片识别（vision 能力），LLM 会静默忽略图片内容，回复"看起来你的消息中没有附带任何图片或文件"。

## 解决方案

### 1. 前端检查（page-chat.js）

在 `sendMessage()` 中上传文件前检查当前模型的 `capabilities` 是否包含 `vision`：

```javascript
const hasImages = filesToUpload.some(f => f.category === 'image');
if (hasImages) {
  const currentModelEntry = availableModels.find(m => m.name === currentModel);
  const hasVision = currentModelEntry && (currentModelEntry.capabilities || []).includes('vision');
  if (!hasVision) {
    const visionModels = availableModels.filter(m => (m.capabilities || []).includes('vision'));
    isSending = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('stopBtn').classList.add('hidden');
    showVisionWarningModal(visionModels);
    return;
  }
}
```

关键点：检查前重置 `isSending`；`pendingFiles` 保持不变。

### 2. 后端配置（models.json）— 关键教训

**`models.json` 中的 `capabilities` 是手动配置的，可能与模型实际能力不一致。**

**案例（2026-08-03）**：LongCat-2.0-Preview 配置了 `vision` 但实际 API 不支持多模态。导致前端检查通过但 LLM 看不到图片。

**修复**：移除 LongCat-2.0-Preview 的 `vision` capability（commit 331aba0）。

**规则**：
- 添加 `vision` capability 前必须用「模型验证」实际探测
- 用户反馈"LLM 说没收到图片"时，**首先检查 models.json 中 capabilities 是否与实际一致**

## Vision Warning Modal

有 vision 模型时列出可切换模型（点击自动切换并重发）；无 vision 模型时提示配置。

## 相关文件

- `page-chat.js`: `sendMessage()`, `showVisionWarningModal()`
- `core.js`: i18n
- `models.json`: capabilities 配置
