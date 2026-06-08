# 模型能力同步到聊天模型选择器（v0.9.87o+）

## chatModelSelect 展示能力 emoji

`page-chat.js` 中的 `loadAvailableModels()` 函数填充 `#chatModelSelect`。
修改后在 option 文本中追加能力 emoji：

```js
const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', function_calling: '🔧' };
for (const m of availableModels) {
  const opt = document.createElement('option');
  opt.value = m.name;
  const alias = m.alias ? ` (${m.alias})` : '';
  const caps = (m.capabilities || []).map(c => capIcons[c] || '').filter(Boolean).join('');
  const capStr = caps ? ` ${caps}` : '';
  opt.textContent = m.name + alias + (m.provider ? ` [${m.provider}]` : '') + capStr;
  if (m.name === currentModel) opt.selected = true;
  sel.appendChild(opt);
}
```

效果：`gpt-4o (alias) [openai] 👁🧠💻🔧`

---

## verifyModel 后同步到 chatModelSelect

`page-settings.js` 的 `verifyModel()` 检测到能力后，需同步写入 `allGlobalModels`（定义在 `page-chat.js`）并调用 `loadAvailableModels()` 刷新下拉框：

```js
// 能力合并后
if (typeof allGlobalModels !== 'undefined') {
  const globalIdx = allGlobalModels.findIndex(gm => gm.name === m.name);
  if (globalIdx >= 0) allGlobalModels[globalIdx].capabilities = merged;
}
renderSettingsModelsList();
autoSaveModels();
if (typeof loadAvailableModels === 'function') loadAvailableModels();
```

### 关键陷阱
- `allGlobalModels` 是 `page-chat.js` 中的 `let` 变量，在 `<script>` 顶层即全局可访问
- `loadAvailableModels` 是 `page-chat.js` 中的函数，跨文件调用必须用 `typeof` 守卫
- `page-chat.js` 在 index.html 中先于 `page-settings.js` 加载（624 vs 631 行），所以调用安全
- **禁止** `m.capabilities || ...caps` 写法（语法错误），必须用 `...(m.capabilities || []), ...caps`

---

## 相关文件
- `webui/static/pages/page-chat.js` — `loadAvailableModels()` 填充 chatModelSelect
- `webui/static/pages/page-settings.js` — `verifyModel()` 能力同步逻辑
- `webui/templates/index.html` — script 加载顺序（page-chat 624, page-settings 631）
