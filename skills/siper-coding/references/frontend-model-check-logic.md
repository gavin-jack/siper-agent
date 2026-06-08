# 前端模型配置检查逻辑（v0.9.30+）

## 核心规则

**页面加载时检查 `/api/models/global` 返回的 `models` 列表长度，为 0 时弹出配置提示。**

```javascript
fetch('/api/models/global').then(r => r.json()).then(d => {
  const models = d.models || [];
  if (models.length === 0) {
    showLlmConfigPrompt();
  }
}).catch(() => {});
```

## 为什么不能用 `llm_configured`

`llm_configured` 检查的是 `agent.llm_client is not None`，但：
- `llm_client` 可能从 env var（`LONGCAT_API_KEY`）初始化，但 `models.json` 仍为空
- 这会导致：用户已配置 env Key → `llm_configured: true` → 不弹窗 → 但 models.json 为空 → 聊天时无法选择模型
- **正确判断**：models.json 中有可用模型 = 已配置

## 弹窗行为

- 标题：模型未配置
- 消息：SiPer 尚未配置任何模型。请添加模型配置后才能开始对话。
- scope 提示：💡 在"全局设置"页面中，输入 Base URL 和 API Key 后点击"获取模型列表"可自动发现可用模型
- "立即配置" → `navigateToPage('global-settings')`（v0.9.31+，导航到全局设置侧边栏页面，不再是弹窗）
- "稍后配置" → 关闭弹窗

## 模型选择器

页面顶部 `chatModelSelect` 下拉框从 `loadAvailableModels()` 加载，数据源同样是 `/api/models/global` 返回的 flat models 列表。
